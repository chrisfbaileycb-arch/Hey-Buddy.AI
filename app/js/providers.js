/**
 * Hey Buddy — Provider API Adapters
 * ===================================
 * Normalizes OpenAI, Anthropic, Google Gemini, and OpenRouter
 * into one consistent streaming interface.
 *
 * Security: API key is passed in at call time (decrypted in memory only).
 * It is NEVER stored in this module, never logged, never sent anywhere except
 * the intended provider endpoint.
 */

import { localChat } from './local-provider.js';

// ── Provider definitions ─────────────────────────────────────
export const PROVIDERS = {
  openai: {
    label:       'OpenAI',
    docsUrl:     'https://platform.openai.com/api-keys',
    models:      [
      { id: 'gpt-4o-mini',  label: 'GPT-4o mini (fast)' },
      { id: 'gpt-4o',       label: 'GPT-4o (smart)' },
      { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    label:       'Anthropic',
    docsUrl:     'https://console.anthropic.com/settings/keys',
    models:      [
      { id: 'claude-haiku-3-5',   label: 'Claude Haiku 3.5 (fast)' },
      { id: 'claude-sonnet-4-5',  label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5',    label: 'Claude Opus 4.5 (powerful)' },
    ],
    defaultModel: 'claude-haiku-3-5',
  },
  google: {
    label:       'Google (Gemini)',
    docsUrl:     'https://aistudio.google.com/apikey',
    models:      [
      { id: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash (fast)' },
      { id: 'gemini-1.5-flash',  label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro',    label: 'Gemini 1.5 Pro' },
    ],
    defaultModel: 'gemini-2.0-flash',
  },
  openrouter: {
    label:       'OpenRouter',
    docsUrl:     'https://openrouter.ai/keys',
    models:      [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: '🦙 Llama 3.3 70B Instruct (FREE)' },
      { id: 'deepseek/deepseek-r1:free',             label: '🐋 DeepSeek R1 Reasoning (FREE)' },
      { id: 'google/gemini-2.0-flash-exp:free',        label: '⚡ Gemini 2.0 Flash (FREE)' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free',  label: '💻 Qwen 2.5 Coder 32B (FREE)' },
      { id: 'anthropic/claude-haiku-3-5',              label: 'Claude Haiku 3.5' },
      { id: 'openai/gpt-4o-mini',                      label: 'GPT-4o mini' },
    ],
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  local: {
    label:       'Local',
    docsUrl:     'https://ollama.com/',
    models:      [], // Dynamically populated
    defaultModel: '',
  },
};

// ── Streaming chat ─────────────────────────────────────────────
/**
 * Send a chat completion request and stream the response back.
 *
 * @param {object} opts
 * @param {string} opts.provider   - 'openai' | 'anthropic' | 'google' | 'openrouter'
 * @param {string} opts.model      - Model ID
 * @param {string} opts.apiKey     - Plaintext key (never stored here)
 * @param {string} opts.system     - System prompt for the persona
 * @param {Array}  opts.messages   - [{ role, content }, ...]
 * @param {function} opts.onChunk  - Called with each text chunk as it streams
 * @param {AbortSignal} opts.signal - AbortController signal
 * @returns {Promise<string>} Full assembled response text
 */
export async function streamChat({ provider, model, apiKey, system, messages, onChunk, signal }) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal });
    case 'anthropic':
      return _streamAnthropic({ model, apiKey, system, messages, onChunk, signal });
    case 'google':
      return _streamGoogle({ model, apiKey, system, messages, onChunk, signal });
    case 'local':
      return _streamLocal({ model, base: apiKey, system, messages, onChunk, signal });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── OpenAI / OpenRouter streaming ──────────────────────────────
async function _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal }) {
  const baseUrl = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://heybuddy.app';
    headers['X-Title'] = 'Hey Buddy';
  }

  const body = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: system },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  return _consumeSSE(res.body, (data) => {
    if (data === '[DONE]') return null;
    try {
      const j = JSON.parse(data);
      return j.choices?.[0]?.delta?.content ?? null;
    } catch { return null; }
  }, onChunk);
}

// ── Anthropic streaming ────────────────────────────────────────
async function _streamAnthropic({ model, apiKey, system, messages, onChunk, signal }) {
  // Anthropic separates system prompt from messages
  const body = {
    model,
    max_tokens: 1024,
    system,
    stream: true,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  return _consumeSSE(res.body, (data) => {
    try {
      const j = JSON.parse(data);
      if (j.type === 'content_block_delta') return j.delta?.text ?? null;
      return null;
    } catch { return null; }
  }, onChunk);
}

// ── Google Gemini streaming ────────────────────────────────────
async function _streamGoogle({ model, apiKey, system, messages, onChunk, signal }) {
  // Gemini uses a different message format
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: 1024 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  return _consumeSSE(res.body, (data) => {
    try {
      const j = JSON.parse(data);
      return j.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch { return null; }
  }, onChunk);
}

async function _streamLocal({ model, base, system, messages, onChunk, signal }) {
  const localMessages = [
    { role: 'system', content: system },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];
  let full = '';
  await localChat({
    base: base || 'http://localhost:11434/v1',
    model,
    messages: localMessages,
    onToken: (chunk) => {
      full += chunk;
      onChunk(chunk);
    },
    signal,
  });
  return full;
}

// ── SSE consumer ───────────────────────────────────────────────
async function _consumeSSE(body, extractChunk, onChunk) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full   = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data  = line.slice(5).trim();
      const chunk = extractChunk(data);
      if (chunk) {
        full += chunk;
        onChunk(chunk);
      }
    }
  }

  return full;
}

// ── Demo mode (no API key needed) ─────────────────────────────
// Returns a scripted response so the app feels alive before a key is set.
const DEMO_RESPONSES = {
  drill: [
    "Listen — I don't know what you're dealing with today. But I know this: you showed up. That's not nothing. That's EVERYTHING. Now let's talk about what we're building.",
    "You want easy? Easy is everywhere. You want REAL? That's why you're here. Tell me what's in the way right now. Let's attack it together.",
    "Three weeks from now, you'll look back at this exact moment. Make sure what you did here was worth looking back at. What's your next move?",
  ],
  haven: [
    "Hey. I'm glad you're here. Whatever's on your mind — there's no rush, no agenda. I'm just here. What's going on?",
    "That sounds really heavy. Thank you for sharing it with me. You don't have to figure all of this out at once. I'm not going anywhere.",
    "Sometimes just saying it out loud makes it a little lighter. I hear you. What feels most pressing right now?",
  ],
  ledger: [
    "Good. Let's take stock. What did you commit to recently, and where do you actually stand on it? No judgment — just clarity.",
    "I remember what you told me last time. Let's look at the gap between intention and action. That's where the insight lives.",
    "Progress isn't always linear. What got in the way? And more importantly — what's the smallest next step you can commit to right now?",
  ],
  coach: [
    "Sleep, hydration, movement — pick the one you're neglecting most right now. That's where we start. Everything else follows from those three.",
    "The science is clear on this: consistency beats intensity every single time. What does sustainable look like for you this week?",
    "Your body keeps the score. What's it telling you today? Let's build around reality, not an ideal version of your schedule.",
  ],
  'first-responder': [
    "If this is a life-threatening emergency, please call 911 or your local emergency number immediately. I'm here to help guide you — what's the situation?",
    "Stay calm — you're doing the right thing by seeking help. Tell me exactly what's happening and I'll walk you through it step by step.",
    "First: make sure the scene is safe. Then tell me what happened and what condition the person is in. We'll go through this together.",
  ],
};

export function getDemoResponse(personaId) {
  const pool = DEMO_RESPONSES[personaId] ?? DEMO_RESPONSES.drill;
  return pool[Math.floor(Math.random() * pool.length)];
}
