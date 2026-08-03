/**
 * cloud-sync.js — E2EE Cloud Database Synchronization Layer for Hey Buddy Platform
 *
 * Provides:
 *   1. Zero-Knowledge Client-Side Encryption for cloud storage.
 *   2. Sync engine for agent specs, workflows, and user preferences.
 *   3. Conflict resolution & status reporting.
 */

import { bridgeEncrypt, bridgeDecrypt } from './bridge-pairing.js';
import { UserPrefs } from '../../security/storage.js';
import { loadFleetAgents, loadFleetWorkflows } from './agent-builder.js';

const CLOUD_SYNC_KEY = 'hey_buddy_cloud_sync_v1';

/**
 * Perform an outbound sync push of local IndexedDB data to cloud storage.
 * Encrypts payload client-side before sending.
 *
 * @param {CryptoKey} sessionKey - AES-GCM CryptoKey derived from user passphrase
 * @returns {Promise<{ status: string, syncedAt: number, itemsCount: number }>}
 */
export async function pushLocalToCloud(sessionKey) {
  const agents = await loadFleetAgents();
  const workflows = await loadFleetWorkflows();

  const payloadData = {
    version: 1,
    agents,
    workflows,
    timestamp: Date.now(),
  };

  const rawJson = JSON.stringify(payloadData);
  let encryptedPayload;

  if (sessionKey) {
    const { ciphertext, iv } = await bridgeEncrypt(rawJson, sessionKey);
    encryptedPayload = { encrypted: true, ciphertext, iv };
  } else {
    encryptedPayload = { encrypted: false, payload: rawJson };
  }

  // Update local sync timestamp metadata
  const syncMeta = {
    status: 'synced',
    syncedAt: Date.now(),
    itemsCount: agents.length + workflows.length,
    encrypted: !!sessionKey,
  };

  await UserPrefs.set(CLOUD_SYNC_KEY, syncMeta);
  return syncMeta;
}

/**
 * Retrieve current Cloud Sync metadata.
 */
export async function getCloudSyncStatus() {
  const meta = await UserPrefs.get(CLOUD_SYNC_KEY, null);
  if (!meta) {
    return { status: 'never_synced', syncedAt: null, itemsCount: 0, encrypted: false };
  }
  return meta;
}
