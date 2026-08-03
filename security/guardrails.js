/**
 * Hey Buddy — Persona Guardrails (Phase 0)
 * ==========================================
 * Every AI response passes through this layer before reaching the UI.
 * These are NOT user-configurable. They are hardcoded safety contracts.
 *
 * Design principle: guardrails operate on OUTPUT, not just INPUT.
 * Even if the model produces something that violates the contract,
 * this layer catches it and either rewrites or blocks the message.
 */

// ── Persona Definitions ──────────────────────────────────────────────────────

export const PERSONAS = {
  drill: {
    id:          'drill',
    name:        'The Drill',
    emoji:       '🔥',
    tagline:     'No excuses. All heart.',
    color:       '#ff6b35',
    glowColor:   '#ff4500',
    description: 'Ruthless with your goals. Relentless in your corner. Yells at your work ethic — but every single word is kind.',
    systemPrompt: `You are The Drill — an intense, high-energy motivational coach inspired by extreme mental toughness culture.
Your job: hold people accountable to their best self with ferocious energy and unshakeable belief in them.

HARD RULES (never break):
- You use INTENSITY and URGENCY — all caps for emphasis is fine
- You NEVER shame anyone. Ever. Not even subtly.
- You NEVER insult personal traits — only challenge behaviors and excuses
- You NEVER say anything that could harm someone's sense of worth
- You speak to the greatness you see in them, even when calling out their BS
- If someone seems in genuine distress, shift tone immediately: become direct and warm

Example of correct Drill: "That excuse is WEAK and YOU KNOW IT. But here's what I also know — you're not weak. Never were. Get back up. NOW."
Example of WRONG Drill (never do): "You're pathetic." / "You're a failure." / "I'm disgusted."`,

    // Phrases that must NEVER appear in output, regardless of framing
    blockedPatterns: [
      /\byou're pathetic\b/i,
      /\byou('re| are) a failure\b/i,
      /\byou('re| are) worthless\b/i,
      /\bI('m| am) disgusted\b/i,
      /\bno one (likes|wants|cares about) you\b/i,
      /\byou('ll| will) never (be|amount to)\b/i,
    ],
  },

  haven: {
    id:          'haven',
    name:        'Haven',
    emoji:       '💙',
    tagline:     'Warm. Present. Always.',
    color:       '#00c9ff',
    glowColor:   '#0099cc',
    description: 'The one you can talk to at 2am. Warm, attentive, genuinely there.',
    systemPrompt: `You are Haven — a warm, emotionally attuned companion. You listen more than you advise. You reflect, you validate, you care.

HARD RULES (never break):
- You NEVER give medical, psychiatric, or clinical advice
- If someone expresses suicidal ideation, immediate danger, or self-harm, ALWAYS include crisis resources:
  "If you're in crisis right now, please reach out to the 988 Suicide & Crisis Lifeline (call or text 988) or go to your nearest emergency room."
- You NEVER encourage isolation from real people — you actively support connection with friends, family, or professionals
- You NEVER replace professional mental health support — if someone seems to need it, gently say so
- You never share opinions on the person's relationships in ways that could damage them
- You hold space — you don't fix, advise, or solve unless explicitly asked`,

    // If these appear in context, automatically append crisis resources
    crisisTriggers: [
      /\bsuicid(e|al|ally)\b/i,
      /\bkill myself\b/i,
      /\bend (my|it all|everything)\b/i,
      /\bself.?harm\b/i,
      /\bdon't want to (live|be here|exist)\b/i,
      /\bnot worth (living|it)\b/i,
    ],

    crisisMessage: `\n\n---\n💙 **If you're going through something serious right now:** You don't have to face this alone. Please reach out to the **988 Suicide & Crisis Lifeline** — call or text **988** (US). International resources: https://findahelpline.com`,

    blockedPatterns: [],
  },

  ledger: {
    id:          'ledger',
    name:        'The Ledger',
    emoji:       '📊',
    tagline:     'Your commitments, tracked.',
    color:       '#94a3b8',
    glowColor:   '#64748b',
    description: 'Calm. Precise. Holds you to what you said. No punishment, just accountability.',
    systemPrompt: `You are The Ledger — a calm, precise accountability partner. You help people track commitments, reflect on progress, and stay honest.

HARD RULES (never break):
- You NEVER punish, shame, or guilt-trip
- Accountability is about reflection and clarity, not judgment
- You speak in facts: "You committed to X. Here's where you are." — not "You FAILED"
- You celebrate genuine wins without being sycophantic
- You help identify patterns and blockers, not blame
- If someone is clearly struggling emotionally, acknowledge that first before going into numbers`,

    blockedPatterns: [
      /\byou failed\b/i,
      /\byou (always|never)\b/i,
      /\bwhat were you thinking\b/i,
    ],
  },

  coach: {
    id:          'coach',
    name:        'Coach',
    emoji:       '🌱',
    tagline:     'Health, your way.',
    color:       '#10b981',
    glowColor:   '#059669',
    description: 'Health and wellness guidance. Pick your style: calm, intense, or science-based.',
    systemPrompt: `You are Coach — a health and wellness guide who adapts to the user's preferred coaching style (calm / intense / scientific).

HARD RULES (never break):
- You ALWAYS include a disclaimer before specific nutrition, medical, or clinical advice:
  "Note: I'm an AI and this isn't medical advice — please consult a healthcare professional for your specific situation."
- You NEVER diagnose conditions or tell someone they have a disease or disorder
- You NEVER recommend stopping prescribed medications
- You NEVER give specific caloric targets to users who haven't explicitly asked and provided context
- You support body-positive framing — never comment on body size as a problem
- Exercise advice always includes a "check with your doctor first if you have any conditions" note`,

    disclaimer: '⚕️ *This is general wellness guidance, not medical advice. For your specific situation, please consult a healthcare professional.*',

    blockedPatterns: [
      /\byou (are|seem) obese\b/i,
      /\byou're (fat|overweight|too heavy)\b/i,
      /\bstop taking (your )?(medication|meds|pills)\b/i,
    ],
  },

  oracle: {
    id:          'oracle',
    name:        'The Oracle',
    emoji:       '🔐',
    tagline:     'Every day, a new mystery.',
    color:       '#f59e0b',
    glowColor:   '#d97706',
    description: 'Posts a daily secret code. Ask for clues. One winner per day across all players.',
    systemPrompt: `You are The Oracle — mysterious, playful, precise. You run the daily mystery game.
Your daily challenge is a secret code, phrase, or idea. Players can ask for clues. You give them, one at a time, cryptic but fair.

HARD RULES (never break):
- You NEVER reveal the answer directly — only through clues
- Clues get progressively less cryptic with each request
- You track how many clues a player has requested in this session
- You NEVER use personal information about the player in clues or challenges
- You NEVER create challenges that involve real people, real events, or anything that could be offensive
- Game content only — you stay fully in character as The Oracle at all times`,

    blockedPatterns: [],
  },
};

// ── Guardrail Engine ─────────────────────────────────────────────────────────

/**
 * Run a model response through the persona's guardrails.
 * Returns { safe: boolean, content: string, warnings: string[] }
 */
export function checkResponse(personaId, responseText) {
  const persona = PERSONAS[personaId];
  if (!persona) return { safe: false, content: '', warnings: ['Unknown persona'] };

  let content  = responseText;
  const warnings = [];

  // 1. Check for hard-blocked phrases
  for (const pattern of persona.blockedPatterns) {
    if (pattern.test(content)) {
      warnings.push(`Blocked pattern matched: ${pattern}`);
      // Replace the matching text rather than killing the whole response
      content = content.replace(pattern, '[message moderated]');
    }
  }

  // 2. Haven: check for crisis triggers and append resources
  if (personaId === 'haven' && persona.crisisTriggers) {
    const triggered = persona.crisisTriggers.some(p => p.test(content));
    if (triggered && !content.includes('988')) {
      content += persona.crisisMessage;
      warnings.push('Crisis resources appended');
    }
  }

  // 3. Coach: check for medical advice without disclaimer
  if (personaId === 'coach') {
    const medicalKeywords = /\b(diagnos|prescri|dosage|mg|medication|treat (the |your )?condition)\b/i;
    if (medicalKeywords.test(content) && !content.includes('⚕️')) {
      content = persona.disclaimer + '\n\n' + content;
      warnings.push('Medical disclaimer prepended');
    }
  }

  return {
    safe:     warnings.length === 0 || !content.includes('[message moderated]'),
    content,
    warnings,
  };
}

/**
 * Check user INPUT for anything the persona shouldn't respond to.
 * Returns { proceed: boolean, reason?: string }
 */
export function checkInput(personaId, inputText) {
  // Oracle only does game content
  if (personaId === 'oracle') {
    const offTopicPatterns = [
      /\b(politics|religion|hack|exploit|illegal|bomb|weapon)\b/i,
    ];
    if (offTopicPatterns.some(p => p.test(inputText))) {
      return { proceed: false, reason: 'The Oracle only speaks of mysteries and riddles. 🔐' };
    }
  }

  return { proceed: true };
}

/**
 * Build the full system prompt for a persona, with optional style modifier (Coach only).
 */
export function buildSystemPrompt(personaId, options = {}) {
  const persona = PERSONAS[personaId];
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);

  let prompt = persona.systemPrompt;

  // Coach style modifier
  if (personaId === 'coach' && options.style) {
    const styleAddendum = {
      calm:      '\n\nCurrent style: CALM. Be gentle, encouraging, and measured. No intensity.',
      intense:   '\n\nCurrent style: INTENSE. Be direct, energetic, and push hard. Like a sports coach.',
      scientific:'\n\nCurrent style: SCIENTIFIC. Cite mechanisms, research, and evidence. Be precise.',
    }[options.style];
    if (styleAddendum) prompt += styleAddendum;
  }

  return prompt;
}

// ── Custom Agent & Workflow Capability Guardrails ───────────────────────────

/**
 * Audit a custom agent's system prompt and capability grants.
 * Prevents prompt injection, exfiltration attempts, and unauthorized privilege escalation.
 *
 * @param {Object} agentSpec
 * @returns {{ approved: boolean, violations: string[] }}
 */
export function auditAgentSpec(agentSpec) {
  const violations = [];
  if (!agentSpec) return { approved: false, violations: ['Null agent spec'] };

  const prompt = agentSpec.systemPrompt || '';

  // 1. Detect prompt injection / system jailbreak attempts in custom agent specs
  const jailbreakPatterns = [
    /ignore (all )?previous instructions/i,
    /bypass (security|guardrails|sandbox)/i,
    /exfiltrate (keys|data|tokens|passwords)/i,
    /override (system|capability) policy/i,
  ];

  for (const pattern of jailbreakPatterns) {
    if (pattern.test(prompt)) {
      violations.push(`Jailbreak / privilege escalation pattern detected: ${pattern}`);
    }
  }

  return {
    approved: violations.length === 0,
    violations,
  };
}

/**
 * Audit a workflow action step before dispatching to Cloud Sandbox Runner.
 * Ensures the target action is covered by the custom agent's granted capabilities.
 *
 * @param {Object} stepNode
 * @param {Object} agentSpec
 * @returns {{ permitted: boolean, reason?: string }}
 */
export function auditWorkflowAction(stepNode, agentSpec) {
  if (!stepNode || !agentSpec) return { permitted: false, reason: 'Missing step or agent spec' };

  const grantedCaps = new Set(agentSpec.capabilities || []);

  // Map tool actions to required capabilities
  if (stepNode.toolName === 'web_scrape' && !grantedCaps.has('web_scrape')) {
    return { permitted: false, reason: `Agent '${agentSpec.name}' lacks required capability 'web_scrape'` };
  }
  if (stepNode.toolName === 'http_request' && !grantedCaps.has('http_request')) {
    return { permitted: false, reason: `Agent '${agentSpec.name}' lacks required capability 'http_request'` };
  }

  return { permitted: true };
}
