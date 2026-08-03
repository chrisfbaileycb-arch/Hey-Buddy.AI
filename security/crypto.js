/**
 * Hey Buddy — API Key Encryption Layer (Phase 0)
 * ================================================
 * API keys are encrypted using AES-GCM with a key derived from the user's passphrase
 * via PBKDF2. The plaintext key NEVER touches disk, logs, or network.
 *
 * Security properties:
 *   - AES-256-GCM: authenticated encryption (confidentiality + integrity)
 *   - PBKDF2: 310,000 iterations (OWASP 2023 minimum), SHA-256
 *   - Random 16-byte salt per key — brute-force cost is per-key, not per-user
 *   - Random 12-byte IV per encryption — nonce never reused
 *   - Web Crypto API only — no third-party crypto library
 *   - Keys never appear in URLs, console.log, error messages, or network requests
 */

const PBKDF2_ITERATIONS = 310_000;
const KEY_LENGTH_BITS    = 256;

// ── Internal helpers ─────────────────────────────────────────────────────────

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function encode(str) { return new TextEncoder().encode(str); }
function decode(buf) { return new TextDecoder().decode(buf); }

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Derive an AES-GCM CryptoKey from a passphrase + salt.
 */
async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw', encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt an API key with the user's passphrase.
 * Returns a serialisable blob safe to store in IndexedDB.
 *
 * @param {string} apiKey      - The plaintext API key (handle transiently, never log)
 * @param {string} passphrase  - User-chosen passphrase (handle transiently, never log)
 * @returns {Promise<object>}  - { salt, iv, ciphertext } — all base64-encoded
 */
export async function encryptApiKey(apiKey, passphrase) {
  const salt       = randomBytes(16);
  const iv         = randomBytes(12);
  const key        = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encode(apiKey)
  );
  return {
    salt:       toBase64(salt),
    iv:         toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    version:    1,
  };
}

/**
 * Decrypt an API key blob. Throws if the passphrase is wrong (AES-GCM auth tag fails).
 *
 * @param {object} blob        - The blob returned by encryptApiKey
 * @param {string} passphrase  - User's passphrase
 * @returns {Promise<string>}  - The plaintext API key
 */
export async function decryptApiKey(blob, passphrase) {
  const salt       = fromBase64(blob.salt);
  const iv         = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);
  const key        = await deriveKey(passphrase, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return decode(plain);
  } catch {
    // AES-GCM auth tag failure = wrong passphrase or tampered data.
    // Generic message — never reveal which.
    throw new Error('Incorrect passphrase or data is corrupted.');
  }
}

/**
 * Test whether a passphrase can decrypt a stored blob (for UI validation).
 * Returns true/false without exposing the key.
 */
export async function verifyPassphrase(blob, passphrase) {
  try { await decryptApiKey(blob, passphrase); return true; }
  catch { return false; }
}

// ── Provider definitions ─────────────────────────────────────────────────────
/**
 * Supported API providers. Each defines how to make a chat completion call.
 * Keys are stored per-provider in IndexedDB (encrypted blob only).
 */
export const PROVIDERS = {
  openai: {
    label:       'OpenAI',
    baseUrl:     'https://api.openai.com/v1',
    docsUrl:     'https://platform.openai.com/api-keys',
    keyPrefix:   'sk-',
    models:      ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel:'gpt-4o-mini',
  },
  anthropic: {
    label:       'Anthropic',
    baseUrl:     'https://api.anthropic.com/v1',
    docsUrl:     'https://console.anthropic.com/settings/keys',
    keyPrefix:   'sk-ant-',
    models:      ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
    defaultModel:'claude-haiku-3-5',
  },
  google: {
    label:       'Google (Gemini)',
    baseUrl:     'https://generativelanguage.googleapis.com/v1beta',
    docsUrl:     'https://aistudio.google.com/apikey',
    keyPrefix:   'AIza',
    models:      ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel:'gemini-2.0-flash',
  },
  openrouter: {
    label:       'OpenRouter',
    baseUrl:     'https://openrouter.ai/api/v1',
    docsUrl:     'https://openrouter.ai/keys',
    keyPrefix:   'sk-or-',
    models:      [],   // OpenRouter routes to any model — user picks
    defaultModel:'',
  },
};
