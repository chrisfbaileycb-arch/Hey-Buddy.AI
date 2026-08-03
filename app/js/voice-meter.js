/**
 * voice-meter.js — the free↔trial↔paid VOICE threshold.
 *
 * Voice is now SELF-HOSTED (Chatterbox/Kokoro via tts-engine.js), so budgets
 * are about fairness + server load, NOT per-character API billing. Free tier
 * still gets a preview-sized budget and doesn't save chats; trial + membership
 * get generous budgets. It counts characters spoken and shows a friendly
 * upgrade nudge at the boundary, and enforces "free tier doesn't save the
 * interaction" via shouldPersist().
 *
 * How to use (before speaking a reply):
 *   const gate = checkVoice({ text, tierId, activeSlots, personaId, isStarterPersona });
 *   if (!gate.allowed) showUpgradeNudge(gate.reason);   // don't call ElevenLabs
 *   else { await speak(...); recordVoiceUsage(text.length, tierId); }
 *
 * Budget state is stored client-side (localStorage). For paid tiers you should
 * ALSO track real usage server-side against your ElevenLabs account so a user
 * can't reset the meter by clearing storage — see notes in INTEGRATION.md.
 */

import { effectiveLimits } from './tier-config.js';

const LS_KEY = 'hb_voice_usage_v1';

function loadUsage() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function saveUsage(u) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(u)); } catch {}
}

/** Window key so monthly/daily/trial budgets reset automatically. */
function windowKey(windowType) {
  const d = new Date();
  if (windowType === 'daily')   return `d:${d.toISOString().slice(0, 10)}`;
  if (windowType === 'monthly') return `m:${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  // 'trial' is a single fixed window for the life of the 3-day trial.
  if (windowType === 'trial')   return 'trial';
  return 'lifetime';
}

/** Characters used so far in the current budget window. */
export function usedChars(tierId = 'free') {
  const lim = effectiveLimits({ tierId });
  const u = loadUsage();
  const key = `${tierId}:${windowKey(lim.voiceBudgetWindow)}`;
  return u[key] || 0;
}

export function remainingChars(tierId = 'free') {
  const lim = effectiveLimits({ tierId });
  return Math.max(0, lim.voiceCharBudget - usedChars(tierId));
}

/**
 * Decide whether this voice request is allowed.
 * Returns { allowed, reason, remaining, needsUpgrade }.
 */
export function checkVoice({ text = '', tierId = 'free', activeSlots = 0, isStarterPersona = true } = {}) {
  const lim = effectiveLimits({ tierId, activeSlots });
  const cost = (text || '').length;

  // Free tier: voice only on built-in "starter" buddies.
  if (lim.voiceOnStarterPersonasOnly && !isStarterPersona) {
    return { allowed: false, needsUpgrade: true, remaining: remainingChars(tierId),
      reason: 'Voice on your own custom buddies is a member perk. Upgrade to hear them speak.' };
  }

  const remaining = remainingChars(tierId);
  if (cost > remaining) {
    return { allowed: false, needsUpgrade: true, remaining,
      reason: lim.voiceBudgetWindow === 'lifetime'
        ? 'You\u2019ve used your free voice preview. Become a member for full voice + deeper chats that remember you.'
        : 'You\u2019ve reached your voice limit for now. Upgrade for more, or it resets next cycle.' };
  }
  return { allowed: true, needsUpgrade: false, remaining };
}

/** Call AFTER a successful ElevenLabs generation to debit the budget. */
export function recordVoiceUsage(charCount, tierId = 'free') {
  const lim = effectiveLimits({ tierId });
  const u = loadUsage();
  const key = `${tierId}:${windowKey(lim.voiceBudgetWindow)}`;
  u[key] = (u[key] || 0) + Math.max(0, charCount | 0);
  saveUsage(u);
}

/**
 * Whether a conversation should be persisted at all.
 * Free tier = false (nothing saved — cost + privacy). Paid = true.
 */
export function shouldPersist(tierId = 'free') {
  return effectiveLimits({ tierId }).saveConversations === true;
}
