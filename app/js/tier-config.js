/**
 * tier-config.js — Hey Buddy Pricing Architecture & Credit Metering Engine
 *
 * UNIFIED THREE-PILLAR PRICING MODEL:
 *   1. Initial Free Trial (Credit Card on File Required):
 *      - 250,000 Free Token Credits granted upon $0 card validation.
 *   2. Managed Token Credit Top-Up Packages (For platform managed models):
 *      - $10 Package  ──  5,000,000 Credits
 *      - $20 Package  ── 12,000,000 Credits (+2M bonus)
 *      - $30 Package  ── 20,000,000 Credits (+5M bonus)
 *      - $50 Package  ── 35,000,000 Credits (+10M bonus)
 *      - $100 Package ── 80,000,000 Credits (+30M bonus)
 *   3. BYOK Pro Membership ($19.95 / month):
 *      - Bring Your Own API Key (OpenAI, Anthropic, Gemini, OpenRouter)
 *      - ZERO token credits used (Pay model API provider direct)
 *      - Unlimited Agent Studio workflows, Cloud Sandbox Runner & E2EE Sync
 */

export const FREE_TRIAL_TOKENS = 250_000;

export const CREDIT_PACKAGES = [
  { id: 'pkg-10',  usd: 10,  credits: 5_000_000,  label: '$10 — 5 Million Credits',  bonusLabel: '' },
  { id: 'pkg-20',  usd: 20,  credits: 12_000_000, label: '$20 — 12 Million Credits', bonusLabel: '+2M Bonus' },
  { id: 'pkg-30',  usd: 30,  credits: 20_000_000, label: '$30 — 20 Million Credits', bonusLabel: '+5M Bonus' },
  { id: 'pkg-50',  usd: 50,  credits: 35_000_000, label: '$50 — 35 Million Credits', bonusLabel: '+10M Bonus' },
  { id: 'pkg-100', usd: 100, credits: 80_000_000, label: '$100 — 80 Million Credits', bonusLabel: '+30M Bonus' },
];

export const PRICING = {
  byokPro:     { id: 'byok-pro', label: 'BYOK Pro Membership', usd: 19.95, interval: 'month' },
  trial:       { id: 'trial', label: 'Card Validation Trial', freeCredits: FREE_TRIAL_TOKENS, cardRequired: true },
};

export const TIERS = {
  free: {
    id: 'free',
    label: 'Free Trial',
    creditsGranted: FREE_TRIAL_TOKENS,
    customPersonaSlots: 1,
    saveConversations: true,
    isPaid: false,
  },
  byok_pro: {
    id: 'byok_pro',
    label: 'BYOK Pro Membership',
    priceUsd: PRICING.byokPro.usd,
    customPersonaSlots: 10,
    saveConversations: true,
    unlimitedBYOK: true,
    isPaid: true,
  },
};

/**
 * Effective runtime limits for a tier.
 *
 * This is the single source the app queries at runtime for voice budgets and
 * whether a conversation is persisted. It's derived from the TIERS table above
 * so the two can never drift. Voice is self-hosted (Chatterbox/Kokoro), so the
 * character budgets are fairness / server-load caps, not per-API billing.
 *
 * @param {{ tierId?: string, activeSlots?: number }} [opts]
 * @returns {{
 *   voiceCharBudget: number,
 *   voiceBudgetWindow: 'daily'|'monthly'|'trial'|'lifetime',
 *   voiceOnStarterPersonasOnly: boolean,
 *   saveConversations: boolean,
 *   customPersonaSlots: number,
 * }}
 */
export function effectiveLimits({ tierId = 'free', activeSlots = 0 } = {}) {
  const tier = TIERS[tierId] || TIERS.free;
  const paid = tier.isPaid === true;

  return {
    // Members get a generous monthly budget; free gets a real preview.
    voiceCharBudget:            paid ? 2_000_000 : 8_000,
    voiceBudgetWindow:          paid ? 'monthly'  : 'lifetime',
    // On the free tier, voice is limited to the built-in starter buddies.
    voiceOnStarterPersonasOnly: !paid,
    // Free tier stays ephemeral (privacy + cost); paid tiers save history.
    saveConversations:          paid,
    customPersonaSlots:         tier.customPersonaSlots ?? 1,
    activeSlots,
  };
}

/**
 * Deduct Token Credits from a user's credit balance.
 * BYPASS RULE: If user is using their OWN API Key (BYOK), skip credit deduction entirely!
 *
 * @param {Object} userState
 * @param {number} tokenCount
 * @param {string} modelId
 * @returns {{ success: boolean, remainingCredits: number, byok: boolean, reason?: string }}
 */
export function deductTokenCredits(userState, tokenCount = 0, modelId = '') {
  // BYOK check: If user provides their own API key (non-managed provider), 0 credits are deducted!
  if (userState.apiConfig && userState.apiConfig.provider !== 'hey_buddy_managed' && userState.apiKeyDecrypted) {
    return { success: true, remainingCredits: userState.creditBalance || 0, byok: true };
  }

  // Model multiplier (protects gross margin across cheap vs expensive models)
  let multiplier = 1;
  if (modelId.includes('gpt-4o') && !modelId.includes('mini')) multiplier = 5;
  if (modelId.includes('claude-3-5-sonnet') || modelId.includes('opus')) multiplier = 5;
  if (modelId.includes('deepseek-r1') || modelId.includes('o1')) multiplier = 8;

  const costInCredits = Math.ceil(tokenCount * multiplier);
  const currentBalance = userState.creditBalance ?? FREE_TRIAL_TOKENS;

  if (currentBalance < costInCredits) {
    return {
      success: false,
      remainingCredits: currentBalance,
      byok: false,
      reason: `Insufficient token credits (${currentBalance.toLocaleString()} remaining). Top up to continue streaming.`,
    };
  }

  const remaining = currentBalance - costInCredits;
  userState.creditBalance = remaining;

  return { success: true, remainingCredits: remaining, byok: false };
}

// ── Stripe Integration Placeholder Hooks ─────────────────────────────────────

/**
 * Stripe Checkout Hook for Credit Packages ($10 - $100).
 * Replace placeholder with your live Stripe publishable key before public launch.
 */
export async function stripeCheckoutCreditPackage(packageId) {
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) throw new Error(`Invalid credit package '${packageId}'`);

  // TODO: Replace with real Stripe Checkout redirect
  // window.location.href = `https://checkout.stripe.com/pay/${pkg.id}`;
  return {
    checkoutUrl: `https://checkout.stripe.com/pay/mock_${pkg.id}`,
    package: pkg,
  };
}

/**
 * Stripe Checkout Hook for BYOK Pro Membership ($19.95/mo).
 * Replace placeholder with your live Stripe publishable key before public launch.
 */
export async function stripeCheckoutBYOKPro() {
  // TODO: Replace with real Stripe Subscription Checkout redirect
  // window.location.href = 'https://checkout.stripe.com/pay/byok_pro_1995';
  return {
    checkoutUrl: 'https://checkout.stripe.com/pay/mock_byok_pro_1995',
    pricing: PRICING.byokPro,
  };
}
