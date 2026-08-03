/**
 * guide-view.js — Mandatory Safety Waiver & Interactive Guide Controller for Hey Buddy
 *
 * Enforces mandatory first-run safety & legal liability acknowledgment before app access.
 * Prevents users from attempting unauthorized massive local model downloads on phone hardware.
 */

import { UserPrefs } from '../../security/storage.js';

const SAFETY_WAIVER_PREF_KEY = 'hey_buddy_safety_waiver_accepted_v1';

export async function hasAcceptedSafetyWaiver() {
  const status = await UserPrefs.get(SAFETY_WAIVER_PREF_KEY, false);
  return !!status;
}

export async function acceptSafetyWaiver() {
  await UserPrefs.set(SAFETY_WAIVER_PREF_KEY, {
    accepted: true,
    acceptedAt: Date.now(),
    acceptedIso: new Date().toISOString(),
  });
}

/**
 * Controller for Mandatory Safety & Liability Waiver Modal
 */
export function initSafetyWaiverModal(dom, onAccepted) {
  if (!dom.waiverCheckbox || !dom.waiverAcceptBtn) return;

  dom.waiverCheckbox.addEventListener('change', () => {
    dom.waiverAcceptBtn.disabled = !dom.waiverCheckbox.checked;
  });

  dom.waiverAcceptBtn.addEventListener('click', async () => {
    if (!dom.waiverCheckbox.checked) return;
    await acceptSafetyWaiver();
    if (onAccepted) onAccepted();
  });
}
