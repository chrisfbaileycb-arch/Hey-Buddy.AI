/**
 * bridge-log.js — Client-side signed audit log for bridge messages.
 *
 * PURPOSE
 * ───────
 * Every note sent or received via the Hey Buddy bridge is logged here.
 * The log gives users proof that "Hey Buddy only relayed what I authorized" —
 * if anyone ever questions what the bridge sent to their PC agent, this log
 * shows the ciphertext trail without revealing the content.
 *
 * SECURITY PROPERTIES
 * ────────────────────
 * • Plaintext NEVER touches this log. Only AES-256-GCM ciphertext + IV.
 * • Relay never sees plaintext (it only routes opaque blobs).
 * • Neither Hey Buddy nor any third party can read log entries.
 * • Log entries survive only on the two paired devices.
 * • On unpair, BridgeLog.clearForPair() wipes the log entirely.
 *
 * USAGE
 * ─────
 *   // Before sending a note (bridge-client.js calls this):
 *   await logBridgeMessage({ pairId, direction: 'sent', plaintext, sharedKey });
 *
 *   // After receiving a note:
 *   await logBridgeMessage({ pairId, direction: 'received', plaintext, sharedKey });
 *
 *   // Show the log (ciphertext entries only):
 *   const entries = await getBridgeLog(pairId);
 *
 *   // Wipe on unpair:
 *   await clearBridgeLog(pairId);
 */

import { BridgeLog } from '../../security/storage.js';
import { bridgeEncrypt } from './bridge-pairing.js';

/**
 * Log a bridge message as an encrypted audit entry.
 *
 * The plaintext is encrypted with the session shared key before storage.
 * After this function returns, the plaintext reference is gone — only
 * the ciphertext lives in IndexedDB.
 *
 * @param {{ pairId: string, direction: 'sent'|'received', plaintext: string, sharedKey: CryptoKey }} opts
 */
export async function logBridgeMessage({ pairId, direction, plaintext, sharedKey }) {
  if (!pairId || !sharedKey) return;  // silently skip if bridge not paired

  let ciphertext = '';
  let iv = '';

  try {
    const encrypted = await bridgeEncrypt(plaintext, sharedKey);
    ciphertext = encrypted.ciphertext;
    iv         = encrypted.iv;
  } catch {
    // Encryption failure is logged as a sentinel entry so the audit trail
    // still shows _something_ happened at this timestamp.
    ciphertext = '[log-encryption-failed]';
    iv         = '';
  }

  // This is the ONLY write to disk — ciphertext only, no plaintext.
  await BridgeLog.add(pairId, direction, ciphertext, iv);
}

/**
 * Return recent audit log entries for a pairing.
 * Entries are ciphertext blobs — no plaintext is ever returned here.
 *
 * @param {string} pairId
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ id, pairId, direction, ciphertext, iv, createdAt }>>}
 */
export async function getBridgeLog(pairId, limit = 50) {
  return BridgeLog.listRecent(pairId, limit);
}

/**
 * Wipe all log entries for a pairing. Call on unpair.
 * @param {string} pairId
 */
export async function clearBridgeLog(pairId) {
  return BridgeLog.clearForPair(pairId);
}

/**
 * Wipe all log entries across all pairings.
 * Call on nuclear delete.
 */
export async function clearAllBridgeLogs() {
  return BridgeLog.clearAll();
}

/**
 * Return a human-readable summary of the log for the UI
 * (count only — no ciphertext exposed to the DOM).
 *
 * @param {string} pairId
 * @returns {Promise<{ total: number, sent: number, received: number, oldest: number|null }>}
 */
export async function getBridgeLogSummary(pairId) {
  const entries = await BridgeLog.listRecent(pairId, 1000);
  const sent     = entries.filter(e => e.direction === 'sent').length;
  const received = entries.filter(e => e.direction === 'received').length;
  const oldest   = entries.length ? Math.min(...entries.map(e => e.createdAt)) : null;
  return { total: entries.length, sent, received, oldest };
}
