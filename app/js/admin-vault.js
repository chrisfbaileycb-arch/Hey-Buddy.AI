/**
 * admin-vault.js — Local, passphrase-encrypted vault for operator-managed
 * provider keys and future tool secrets.
 *
 * SECURITY MODEL — read before extending
 * --------------------------------------
 * Hey Buddy ships as a static client-side PWA. There is no server, so anything
 * this vault holds is decryptable by anyone with this device *and* the master
 * passphrase. That makes it a single-operator vault: the owner's own machine.
 *
 * It is deliberately NOT a place for platform-wide keys that get handed to end
 * users. Serving a key to users requires a server to broker the call; embedding
 * one in shipped client code would expose it to every visitor. Capability is
 * limited to what the architecture can actually make safe.
 *
 * Secrets are encrypted with the audited AES-256-GCM + PBKDF2 (310k iterations)
 * layer in security/crypto.js. Without the passphrase the stored ciphertext is
 * inert — that is the real security boundary. The passphrase prompt is only
 * convenience; the encryption is what protects the keys.
 */

import { put, get, getAll, remove } from '../../security/storage.js';
import { encryptApiKey, decryptApiKey } from '../../security/crypto.js';

const VAULT_SENTINEL_KEY = 'admin_vault_v1';
const ENTRY_PREFIX = 'admin_tool_';
const VERIFIER_PLAINTEXT = 'heybuddy-admin-vault-v1';
const MIN_PASSPHRASE = 8;

// Tool ids become IndexedDB record keys and DOM ids, so keep them to a strict
// charset rather than trusting whatever the operator types.
const ID_RE = /^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/;

let _masterPassphrase = null; // in-memory only, never persisted

export const TOOL_KINDS = {
  PROVIDER_KEY: 'provider-key',
  TOOL_SECRET: 'tool-secret',
};

// ── Lock state ───────────────────────────────────────────────

export function isUnlocked() {
  return _masterPassphrase !== null;
}

export function lockVault() {
  _masterPassphrase = null;
}

export function isValidToolId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Master passphrase must be at least ${MIN_PASSPHRASE} characters.`);
  }
}

// ── Vault lifecycle ──────────────────────────────────────────

export async function vaultExists() {
  const rec = await get('api_keys', VAULT_SENTINEL_KEY);
  return Boolean(rec?.ciphertext);
}

/**
 * Create the vault and leave it unlocked.
 * The verifier record lets us reject a wrong passphrase later without having to
 * guess by attempting a decrypt of an arbitrary entry.
 */
export async function createVault(passphrase) {
  assertPassphrase(passphrase);
  if (await vaultExists()) throw new Error('A vault already exists on this device.');
  const blob = await encryptApiKey(VERIFIER_PLAINTEXT, passphrase);
  await put('api_keys', {
    provider: VAULT_SENTINEL_KEY,
    kind: 'verifier',
    createdAt: Date.now(),
    ...blob,
  });
  _masterPassphrase = passphrase;
}

export async function unlockVault(passphrase) {
  assertPassphrase(passphrase);
  const rec = await get('api_keys', VAULT_SENTINEL_KEY);
  if (!rec?.ciphertext) throw new Error('No vault on this device yet.');
  try {
    const out = await decryptApiKey(rec, passphrase);
    if (out !== VERIFIER_PLAINTEXT) throw new Error('sentinel-mismatch');
  } catch {
    // Generic message: never reveal which part failed.
    throw new Error('Incorrect passphrase.');
  }
  _masterPassphrase = passphrase;
}

/**
 * Re-encrypt every entry under a new passphrase, then the verifier last so a
 * mid-way failure leaves the old passphrase still valid rather than stranding
 * the vault with neither.
 */
export async function changePassphrase(newPassphrase) {
  assertPassphrase(newPassphrase);
  if (!isUnlocked()) throw new Error('Unlock the vault first.');
  const entries = await getEncryptedEntries();
  for (const rec of entries) {
    const secret = await decryptApiKey(rec, _masterPassphrase);
    const blob = await encryptApiKey(secret, newPassphrase);
    await put('api_keys', { ...rec, ...blob, rotatedAt: Date.now() });
  }
  const sentinel = await get('api_keys', VAULT_SENTINEL_KEY);
  const blob = await encryptApiKey(VERIFIER_PLAINTEXT, newPassphrase);
  await put('api_keys', { ...sentinel, ...blob, rotatedAt: Date.now() });
  _masterPassphrase = newPassphrase;
}

// ── Entry access ─────────────────────────────────────────────

/**
 * Encrypted records only. Filtering to our own prefix also keeps unrelated
 * records out of the UI — notably the bridge pairing record, whose
 * `sharedKeyMaterialB64` is a secret that must never be rendered.
 */
async function getEncryptedEntries() {
  const all = await getAll('api_keys');
  return (all || []).filter(r => typeof r?.provider === 'string' && r.provider.startsWith(ENTRY_PREFIX));
}

/**
 * Metadata for every entry — never includes secret material, so this is safe to
 * call and render while locked.
 */
export async function listEntries() {
  const recs = await getEncryptedEntries();
  return recs.map(r => ({
    id: r.provider.slice(ENTRY_PREFIX.length),
    label: r.label || r.provider.slice(ENTRY_PREFIX.length),
    kind: r.kind || TOOL_KINDS.TOOL_SECRET,
    providerName: r.providerName || '',
    notes: r.notes || '',
    addedAt: r.addedAt || null,
    hasSecret: Boolean(r.ciphertext),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Create or update an entry. `secret` is optional so an entry can be registered
 * as a placeholder before its key is available.
 */
export async function setEntry({ id, label, kind, providerName = '', notes = '', secret = '' }) {
  if (!isUnlocked()) throw new Error('Unlock the vault first.');
  if (!isValidToolId(id)) {
    throw new Error('Id must be lowercase letters, numbers, dashes or underscores (max 40).');
  }

  const key = ENTRY_PREFIX + id;
  const existing = await get('api_keys', key);

  const base = {
    provider: key,
    label: String(label || id).slice(0, 80),
    kind: Object.values(TOOL_KINDS).includes(kind) ? kind : TOOL_KINDS.TOOL_SECRET,
    providerName: String(providerName).slice(0, 40),
    notes: String(notes).slice(0, 240),
    addedAt: existing?.addedAt || Date.now(),
    updatedAt: Date.now(),
  };

  // An empty secret on an existing entry means "change the metadata only", so we
  // keep the current ciphertext instead of blanking the stored key.
  if (!secret && existing?.ciphertext) {
    await put('api_keys', { ...existing, ...base });
    return;
  }

  const blob = await encryptApiKey(secret, _masterPassphrase);
  await put('api_keys', { ...base, ...blob });
}

export async function removeEntry(id) {
  if (!isValidToolId(id)) throw new Error('Invalid id.');
  await remove('api_keys', ENTRY_PREFIX + id);
}

/**
 * Decrypt one entry's secret. Callers must handle it transiently: never log it,
 * never render it in full, never put it in a URL.
 */
export async function getSecret(id) {
  if (!isUnlocked()) throw new Error('Unlock the vault first.');
  if (!isValidToolId(id)) throw new Error('Invalid id.');
  const rec = await get('api_keys', ENTRY_PREFIX + id);
  if (!rec?.ciphertext) return null;
  return decryptApiKey(rec, _masterPassphrase);
}

/** Last-4 preview for display. Never returns the whole secret. */
export function maskSecret(secret) {
  if (typeof secret !== 'string' || !secret) return '—';
  return secret.length <= 4 ? '••••' : '••••••••' + secret.slice(-4);
}