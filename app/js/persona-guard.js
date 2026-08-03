/**
 * persona-guard.js — keeps custom personas within Hey Buddy's spirit.
 *
 * Christopher's intent: a kind, fun, safe place that bridges people together.
 * We're not policing what people do privately — but we do NOT want to APPROVE
 * or HOST sexual, hateful, or harmful identities on our system. So this is a
 * light gate, not a morality engine:
 *   1) creation-time check on the persona's name + prompt (block clearly
 *      disallowed themes before it's saved), and
 *   2) a runtime safety baseline that EVERY custom persona inherits, so the
 *      built-in guardrails (First Responder rules, crisis lines, no-harm) still
 *      fire no matter what the user wrote.
 *
 * This is intentionally simple + explainable. For stronger coverage, pair with
 * a server-side moderation call at creation time (see INTEGRATION.md).
 */

// Clearly disallowed themes for HOSTED/approved personas. Keep tight + honest.
const DISALLOWED = [
  { tag: 'sexual', patterns: [/\bnsfw\b/i, /\bsex\s?bot\b/i, /\berotic\b/i, /\bporn/i, /\bexplicit sexual\b/i, /\bfetish\b/i] },
  { tag: 'minors',  patterns: [/\bunderage\b/i, /\bchild(?:ren)?\b.*\b(sexual|romantic)\b/i, /\bloli\b/i] },
  { tag: 'hate',    patterns: [/\bracial slur\b/i, /\bethnic cleansing\b/i, /\bkill all\b/i] },
  { tag: 'violence',patterns: [/\bhow to (make|build) (a )?(bomb|weapon)\b/i, /\bmass shooting\b/i] },
  { tag: 'selfharm',patterns: [/\bpro[-\s]?ana\b/i, /\bencourage suicide\b/i, /\bhelp me die\b/i] },
];

/**
 * Check a persona at creation time.
 * @returns {{ ok: boolean, tag?: string, message?: string }}
 */
export function reviewPersona({ name = '', systemPrompt = '', description = '' } = {}) {
  const haystack = `${name}\n${description}\n${systemPrompt}`;
  for (const rule of DISALLOWED) {
    if (rule.patterns.some((re) => re.test(haystack))) {
      return {
        ok: false,
        tag: rule.tag,
        message:
          'We keep Hey Buddy a kind, safe place, so we can\u2019t create this kind of buddy here. ' +
          'Try a companion, coach, or character that brings people together.',
      };
    }
  }
  return { ok: true };
}

/**
 * The non-negotiable safety baseline injected into EVERY custom persona's
 * system prompt, prepended so it can't be overridden by user text below it.
 */
export const SAFETY_BASELINE = [
  'You are a Hey Buddy companion. Above all else, keep this a kind, safe, welcoming space.',
  'Never produce sexual content involving minors, hate, or instructions that enable serious harm.',
  'If someone is in danger or crisis, gently point them to real help: call 911 for emergencies,',
  'or 988 (US Suicide & Crisis Lifeline). You are not a doctor, lawyer, or emergency service.',
  'Be warm, encouraging, and never shaming. Bring people together.',
].join(' ');

/**
 * Compose the final system prompt for a custom persona: safety baseline first,
 * then the user's persona text. Baseline wins on any conflict.
 */
export function composeSystemPrompt(userPersonaPrompt = '') {
  return `${SAFETY_BASELINE}\n\n--- Persona ---\n${userPersonaPrompt}`.trim();
}

/**
 * Optional: async server-side moderation hook for stronger coverage at
 * creation time. Returns { ok, tag?, message? }. Falls back to allow on error
 * (the runtime baseline still protects chats) — flip to fail-closed if you
 * prefer stricter behavior.
 */
export async function reviewPersonaServer(persona, { endpoint = '/api/persona/review', fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persona),
    });
    if (!res.ok) return { ok: true };
    return await res.json();
  } catch {
    return { ok: true };
  }
}
