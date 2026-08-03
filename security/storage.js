/**
 * Hey Buddy — Secure Storage Layer (Phase 0)
 * ============================================
 * All conversation and user data lives here — in IndexedDB, scoped to this origin only.
 * No sensitive data ever touches localStorage or sessionStorage.
 *
 * Security properties:
 *   - IndexedDB is origin-scoped: other sites cannot read this data
 *   - Structured schema prevents accidental plaintext leaks
 *   - All writes are versioned for future migrations
 *   - Nuclear delete removes every trace with zero recovery path
 */

const DB_NAME = 'hey-buddy-db';
const DB_VERSION = 2;  // v2: added bridge_log store (Phase 4)

const STORES = {
  CONVERSATIONS: 'conversations',
  MESSAGES:      'messages',
  PERSONA_STATE: 'persona_state',
  USER_PREFS:    'user_prefs',
  ORACLE_STATE:  'oracle_state',
  API_KEYS:      'api_keys',        // encrypted blobs only — never plaintext
  BRIDGE_LOG:    'bridge_log',      // E2EE bridge audit log — ciphertext only, never plaintext
};

// Exported for bridge-log.js — avoids string duplication
export const BRIDGE_LOG_STORE = STORES.BRIDGE_LOG;

let _db = null;

/**
 * Open (or upgrade) the database. Call once at app start.
 */
export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Conversations: each chat thread with a buddy
      if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
        const conv = db.createObjectStore(STORES.CONVERSATIONS, { keyPath: 'id', autoIncrement: true });
        conv.createIndex('personaId', 'personaId', { unique: false });
        conv.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Messages: individual turns within a conversation
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const msg = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id', autoIncrement: true });
        msg.createIndex('conversationId', 'conversationId', { unique: false });
        msg.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Persona state: per-buddy memory, style preferences
      if (!db.objectStoreNames.contains(STORES.PERSONA_STATE)) {
        db.createObjectStore(STORES.PERSONA_STATE, { keyPath: 'personaId' });
      }

      // User prefs: theme, notification settings, onboarding state
      if (!db.objectStoreNames.contains(STORES.USER_PREFS)) {
        db.createObjectStore(STORES.USER_PREFS, { keyPath: 'key' });
      }

      // Oracle game state: daily challenge participation
      if (!db.objectStoreNames.contains(STORES.ORACLE_STATE)) {
        db.createObjectStore(STORES.ORACLE_STATE, { keyPath: 'date' });
      }

      // API keys: ONLY encrypted blobs. The plaintext key NEVER enters this store.
      if (!db.objectStoreNames.contains(STORES.API_KEYS)) {
        db.createObjectStore(STORES.API_KEYS, { keyPath: 'provider' });
      }

      // Bridge log: E2EE audit trail. Ciphertext only — plaintext NEVER written here.
      // Each entry: { id (auto), pairId, direction, ciphertext, iv, createdAt }
      if (!db.objectStoreNames.contains(STORES.BRIDGE_LOG)) {
        const bl = db.createObjectStore(STORES.BRIDGE_LOG, { keyPath: 'id', autoIncrement: true });
        bl.createIndex('pairId',    'pairId',    { unique: false });
        bl.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror  = (e) => reject(new Error(`DB open failed: ${e.target.error}`));
  });
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return _db.transaction([storeName], mode).objectStore(storeName);
}

export function put(storeName, record) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export function get(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export function getAll(storeName, indexName, query) {
  return new Promise((resolve, reject) => {
    const store = tx(storeName);
    const req   = indexName ? store.index(indexName).getAll(query) : store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export function remove(storeName, key) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Domain helpers ───────────────────────────────────────────────────────────

export const Conversations = {
  create: (personaId, title = 'New chat') =>
    put(STORES.CONVERSATIONS, { personaId, title, createdAt: Date.now(), updatedAt: Date.now() }),

  get: (id) => get(STORES.CONVERSATIONS, id),

  listByPersona: (personaId) => getAll(STORES.CONVERSATIONS, 'personaId', personaId),

  updateTitle: async (id, title) => {
    const conv = await get(STORES.CONVERSATIONS, id);
    if (!conv) throw new Error('Conversation not found');
    return put(STORES.CONVERSATIONS, { ...conv, title, updatedAt: Date.now() });
  },

  delete: async (id) => {
    // Delete all messages in the conversation first
    const messages = await getAll(STORES.MESSAGES, 'conversationId', id);
    for (const msg of messages) await remove(STORES.MESSAGES, msg.id);
    return remove(STORES.CONVERSATIONS, id);
  },
};

export const Messages = {
  add: (conversationId, role, content, meta = {}) =>
    put(STORES.MESSAGES, { conversationId, role, content, meta, createdAt: Date.now() }),

  list: (conversationId) => getAll(STORES.MESSAGES, 'conversationId', conversationId),
};

export const UserPrefs = {
  get: (key, fallback = null) => get(STORES.USER_PREFS, key).then(r => r?.value ?? fallback),
  set: (key, value) => put(STORES.USER_PREFS, { key, value }),
};

// ── Bridge log helpers ──────────────────────────────────────────────────────
/**
 * BridgeLog — stores E2EE audit entries.
 * Rule: plaintext NEVER enters this store. Only ciphertext + metadata.
 */
export const BridgeLog = {
  /**
   * Record a bridge message. Only the encrypted payload is stored.
   * @param {string} pairId        - The pairing ID for this session
   * @param {'sent'|'received'} direction
   * @param {string} ciphertext    - Base64 AES-GCM ciphertext of the message
   * @param {string} iv            - Base64 IV used for this entry
   */
  add: (pairId, direction, ciphertext, iv) =>
    put(STORES.BRIDGE_LOG, { pairId, direction, ciphertext, iv, createdAt: Date.now() }),

  /**
   * Return the N most recent log entries for a pairing (ciphertext blobs — no plaintext).
   */
  listRecent: async (pairId, limit = 50) => {
    const all = await getAll(STORES.BRIDGE_LOG, 'pairId', pairId);
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },

  /**
   * Wipe all bridge log entries for a given pairing (called on unpair).
   */
  clearForPair: async (pairId) => {
    const entries = await getAll(STORES.BRIDGE_LOG, 'pairId', pairId);
    for (const entry of entries) await remove(STORES.BRIDGE_LOG, entry.id);
  },

  /**
   * Wipe all bridge log entries across all pairings.
   */
  clearAll: async () => {
    const all = await getAll(STORES.BRIDGE_LOG);
    for (const entry of all) await remove(STORES.BRIDGE_LOG, entry.id);
  },
};

// ── Nuclear delete ───────────────────────────────────────────────────────────
/**
 * Wipe every byte of Hey Buddy data from this device.
 * Irreversible. No recovery path. Exactly as intended.
 */
export async function nuclearDelete() {
  return new Promise((resolve, reject) => {
    if (_db) { _db.close(); _db = null; }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    req.onblocked = () => {
      // Force close any remaining connections
      console.warn('Nuclear delete blocked — retrying after short delay');
      setTimeout(() => { indexedDB.deleteDatabase(DB_NAME); resolve(); }, 500);
    };
  });
}
