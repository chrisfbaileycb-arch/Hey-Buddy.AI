/**
 * model-access.js — Free vs paid model classification and visibility toggles.
 *
 * A configured key can reach far more models than the curated list shows
 * (OpenRouter alone publishes 300+). Rather than dump them all into one picker,
 * entries are split into a free tier and a paid tier and either group can be
 * hidden, which is what makes the paid inventory legible once usage is billed.
 *
 * Classification follows the rule OpenRouter itself uses: a model is free when
 * both prompt and completion prices are zero, or its id carries the `:free`
 * suffix. Live catalog rows already carry an authoritative `free` flag computed
 * from pricing, so that wins when present.
 */

import { UserPrefs } from '../../security/storage.js';

export const VISIBILITY_PREF_KEY = 'hb_model_visibility_v1';

export const TIER = {
  FREE: 'free',
  PAID: 'paid',
};

export function isFreeModelId(id) {
  return typeof id === 'string' && id.endsWith(':free');
}

export function classifyModel(entry) {
  if (entry && typeof entry.free === 'boolean') {
    return entry.free ? TIER.FREE : TIER.PAID;
  }
  if (isFreeModelId(entry?.id)) return TIER.FREE;
  // Curated entries for the hosted providers are all billed APIs.
  return TIER.PAID;
}

/** Default to showing everything so a fresh install is never an empty picker. */
export async function getVisibility() {
  const saved = await UserPrefs.get(VISIBILITY_PREF_KEY, null);
  return {
    showFree: saved?.showFree !== false,
    showPaid: saved?.showPaid !== false,
  };
}

export async function setVisibility({ showFree, showPaid }) {
  const next = { showFree: showFree !== false, showPaid: showPaid !== false };
  await UserPrefs.set(VISIBILITY_PREF_KEY, next);
  return next;
}

export function applyVisibility(models, vis) {
  return (models || []).filter(m =>
    classifyModel(m) === TIER.FREE ? vis.showFree : vis.showPaid);
}

export function countByTier(models) {
  let free = 0;
  let paid = 0;
  for (const m of models || []) {
    if (classifyModel(m) === TIER.FREE) free += 1;
    else paid += 1;
  }
  return { free, paid, total: free + paid };
}