/**
 * persona-vault.js — device-only, exportable, server-ephemeral custom personas.
 *
 * Christopher's model for PAID custom personas (companions / life coaches):
 *   - The user can "pick up where they left off" ON THEIR DEVICE.
 *   - The persona + its chat content do NOT live permanently on OUR servers.
 *     Any server-side copy is a short-lived cache that we clear.
 *   - Users must OFFLOAD/UNLOAD paid personas: we give them an encrypted export
 *     file (portable across devices) and tell them clearly that if they don't
 *     export, it stays only on this device.
 *   - This keeps us from hosting user-generated identities (e.g. NSFW bots).
 *
 * Storage: encrypted blob in IndexedDB/localStorage on the device. Reuses the
 * app's existing AES-256-GCM crypto (crypto.js) — DO NOT hand-roll new crypto.
 *
 * The functions below take an injected `crypto` object with:
 *   crypto.encrypt(plaintextString) -> Promise<{ciphertext, iv, ...}>
 *   crypto.decrypt(blob)            -> Promise<string>
 * so this module stays aligned with the app's key management (keychain path).
 */

const STORE_KEY = 'hb_custom_personas_v1';
const EXPORT_MAGIC = 'HEYBUDDY-PERSONA-1';

/* ----------------------------- device storage ----------------------------- */

function loadIndex() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveIndex(idx) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(idx)); } catch {}
}

/** Save (create/update) a custom persona locally, encrypted. */
export async function savePersona(persona, crypto) {
  const idx = loadIndex();
  const record = {
    id: persona.id || `custom-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    // Persona + its chat history are encrypted together as one blob.
    blob: await crypto.encrypt(JSON.stringify(persona)),
  };
  idx[record.id] = record;
  saveIndex(idx);
  return record.id;
}

/** Load and decrypt a persona (pick up where they left off, same device). */
export async function loadPersona(id, crypto) {
  const rec = loadIndex()[id];
  if (!rec) return null;
  try { return JSON.parse(await crypto.decrypt(rec.blob)); }
  catch { return null; }
}

/** List saved custom persona ids + timestamps (no decryption needed). */
export function listPersonas() {
  const idx = loadIndex();
  return Object.values(idx).map((r) => ({ id: r.id, updatedAt: r.updatedAt }));
}

/** Delete a persona from this device. */
export function deletePersona(id) {
  const idx = loadIndex();
  delete idx[id];
  saveIndex(idx);
}

/* ------------------------- offload / export & import ------------------------ */

/**
 * Export an encrypted, portable persona file the user can save and re-import
 * on any device. This is the "offload/unload" mechanic. Returns a Blob.
 */
export async function exportPersona(id, crypto) {
  const persona = await loadPersona(id, crypto);
  if (!persona) throw new Error('Persona not found on this device.');
  // Re-encrypt for portability (same key path). Wrap with a magic header.
  const payload = {
    magic: EXPORT_MAGIC,
    exportedAt: new Date().toISOString(),
    blob: await crypto.encrypt(JSON.stringify(persona)),
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

/** Import a previously exported persona file back onto this device. */
export async function importPersona(fileText, crypto) {
  const payload = JSON.parse(fileText);
  if (payload.magic !== EXPORT_MAGIC) throw new Error('Not a Hey Buddy persona file.');
  const persona = JSON.parse(await crypto.decrypt(payload.blob));
  return savePersona(persona, crypto);
}

/* --------------------- server-side ephemerality (cache clear) --------------- */

/**
 * Clear any short-lived server cache for a paid custom persona. Call this:
 *   - when the user closes/switches away from a paid persona,
 *   - on sign-out,
 *   - after an export (they now hold the durable copy).
 * The backend endpoint should delete any transient session/cache rows and
 * return { cleared: true }. We intentionally keep NO durable server copy.
 */
export async function clearServerCache(personaId, { endpoint = '/api/persona/cache', fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${endpoint}?id=${encodeURIComponent(personaId)}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

/** User-facing notice text explaining the offload requirement. */
export const OFFLOAD_NOTICE =
  'Your custom buddies live on THIS device and are cleared from our servers for your privacy. ' +
  'To keep one or move it to another device, export it \u2014 if you don\u2019t, it stays only here.';
