/**
 * device-guard.js — Size & memory protection for Hey Buddy local models.
 *
 * Christopher's rule: a model download or load must NEVER threaten a person's
 * phone storage or operating system. This module runs BEFORE any download and
 * BEFORE any load, refusing clearly with a friendly message instead of crashing
 * (the exact PocketPal failure we set out to fix).
 *
 * Browser APIs used (all optional / progressively enhanced):
 *   - navigator.storage.estimate()      -> free disk quota (StorageManager)
 *   - navigator.deviceMemory            -> approx RAM in GB (Device Memory API)
 *   - navigator.userAgentData.mobile    -> phone vs desktop hint
 * On native (Capacitor/RN) wrappers, swap these for the platform's real
 * filesystem/RAM APIs — the decision logic below is identical.
 */

import { MAX_DOWNLOAD_MB } from './model-catalog.js';

const SAFETY_MARGIN_MB = 500;   // never fill the disk to the brim
const RAM_HEADROOM_RATIO = 0.6; // only ever plan to use ~60% of reported RAM

/** Best-effort device classification. */
export function detectDeviceKind() {
  try {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile ? 'phone' : 'desktop';
    }
  } catch { /* ignore */ }
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'phone' : 'desktop';
}

/** Returns { freeMb, quotaMb, known }. */
export async function getFreeSpaceMb() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      const quota = (est.quota || 0) / (1024 * 1024);
      const usage = (est.usage || 0) / (1024 * 1024);
      return { freeMb: Math.max(0, quota - usage), quotaMb: quota, known: quota > 0 };
    }
  } catch { /* ignore */ }
  return { freeMb: 0, quotaMb: 0, known: false };
}

/** Returns approx RAM in MB, or null if unknown. */
export function getApproxRamMb() {
  const gb = navigator.deviceMemory; // 0.25 .. 8, coarse by design
  return typeof gb === 'number' && gb > 0 ? Math.round(gb * 1024) : null;
}

/**
 * Decide whether a model can be SAFELY DOWNLOADED.
 * Returns { ok, reason, level } where level is 'ok' | 'warn' | 'block'.
 */
export async function canDownload(model) {
  // Hard ceiling: never exceed the app's curated max.
  if (model.sizeMb > MAX_DOWNLOAD_MB) {
    return { ok: false, level: 'block',
      reason: `This model is larger than Hey Buddy allows (${MAX_DOWNLOAD_MB} MB cap). Blocked to protect your device.` };
  }
  const { freeMb, known } = await getFreeSpaceMb();
  const needed = (model.minFreeMb || model.sizeMb) + SAFETY_MARGIN_MB;

  if (!known) {
    return { ok: true, level: 'warn',
      reason: `Hey Buddy couldn't read your free space on this device. This model needs about ${model.sizeMb} MB — only continue if you know you have room.` };
  }
  if (freeMb < needed) {
    return { ok: false, level: 'block',
      reason: `Not enough free space. Needs ~${Math.round(needed)} MB, but only ${Math.round(freeMb)} MB is free. Free up space or pick a smaller buddy model.` };
  }
  if (freeMb < needed * 1.5) {
    return { ok: true, level: 'warn',
      reason: `This will fit, but space is tight (${Math.round(freeMb)} MB free). A smaller model would leave more room.` };
  }
  return { ok: true, level: 'ok', reason: 'Plenty of room. Safe to download.' };
}

/**
 * Decide whether a model can be SAFELY LOADED into memory.
 * Prevents the OOM crash-on-load bug. Returns same shape as canDownload.
 */
export function canLoad(model) {
  const ram = getApproxRamMb();
  if (ram == null) {
    return { ok: true, level: 'warn',
      reason: `Hey Buddy couldn't read this device's memory. If the app feels unstable, switch to a smaller buddy model.` };
  }
  const usableRam = ram * RAM_HEADROOM_RATIO;
  if (model.minRamMb > usableRam) {
    return { ok: false, level: 'block',
      reason: `This device has about ${ram} MB RAM. Loading this model safely needs ~${model.minRamMb} MB. Blocked to keep your device stable — pick a lighter buddy.` };
  }
  if (model.minRamMb > usableRam * 0.8) {
    return { ok: true, level: 'warn',
      reason: `This will run but may be slow on this device. A smaller model would feel snappier.` };
  }
  return { ok: true, level: 'ok', reason: 'This device can run it comfortably.' };
}

/** Convenience: full pre-flight combining space + memory. */
export async function preflight(model) {
  const dl = await canDownload(model);
  const load = canLoad(model);
  const worst = [dl, load].sort((a, b) =>
    rank(b.level) - rank(a.level))[0];
  return { download: dl, load, verdict: worst.level, ok: dl.ok && load.ok };
}

function rank(level) { return level === 'block' ? 2 : level === 'warn' ? 1 : 0; }
