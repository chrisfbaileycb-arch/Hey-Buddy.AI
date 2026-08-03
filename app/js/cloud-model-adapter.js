/**
 * cloud-model-adapter.js — Unified Model Runtime Adapter for Hey Buddy Platform
 *
 * Inspired by LobeHub's @lobechat/model-runtime.
 * Provides a stateless, normalized streaming completion layer across multiple AI providers:
 *   • OpenAI (GPT-4o, GPT-4o-mini)
 *   • Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
 *   • Google Gemini (Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0)
 *   • OpenRouter (Unified multi-model access)
 */

export const PROVIDERS = {
  OPENAI:     'openai',
  ANTHROPIC:  'anthropic',
  GEMINI:     'gemini',
  OPENROUTER: 'openrouter',
};

export const PROVIDER_CATALOG = {
  [PROVIDERS.OPENAI]: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  [PROVIDERS.ANTHROPIC]: {
    name: 'Anthropic',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  [PROVIDERS.GEMINI]: {
    name: 'Google Gemini',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  [PROVIDERS.OPENROUTER]: {
    name: 'OpenRouter',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-pro-1.5'],
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  },
};

/**
 * Universal Unified Model Completion Streamer
 * Normalizes input messages and token streaming across all providers.
 *
 * @param {Object} opts
 * @param {string} opts.provider - 'openai' | 'anthropic' | 'gemini' | 'openrouter'
 * @param {string} opts.apiKey - Provider API key
 * @param {string} opts.model - Target model identifier
 * @param {Array}  opts.messages - Standard [{ role, content }] message array
 * @param {Function} opts.onToken - Callback (token: string) => void
 * @param {AbortSignal} [opts.signal]
 */
export async function streamModelCompletion({ provider, apiKey, model, messages, onToken, signal }) {
  if (!apiKey) throw new Error(`Missing API Key for provider '${provider}'`);

  switch (provider) {
    case PROVIDERS.OPENAI:
    case PROVIDERS.OPENROUTER:
      return streamOpenAIStyle({ provider, apiKey, model, messages, onToken, signal });
    case PROVIDERS.ANTHROPIC:
      return streamAnthropic({ apiKey, model, messages, onToken, signal });
    case PROVIDERS.GEMINI:
      return streamGemini({ apiKey, model, messages, onToken, signal });
    default:
      throw new Error(`Unsupported model provider: '${provider}'`);
  }
}

/**
 * Stream completion for OpenAI & OpenRouter standard API endpoints
 */
async function streamOpenAIStyle({ provider, apiKey, model, messages, onToken, signal }) {
  const url = PROVIDER_CATALOG[provider].endpoint;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(provider === PROVIDERS.OPENROUTER ? { 'HTTP-Referer': 'https://hey-buddy.app', 'X-Title': 'Hey Buddy' } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`${provider.toUpperCase()} API error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') return;
      try {
        const json = JSON.parse(dataStr);
        const token = json.choices?.[0]?.delta?.content || '';
        if (token) onToken(token);
      } catch { /* partial chunk */ }
    }
  }
}

/**
 * Stream completion for Anthropic API (Messages endpoint)
 */
async function streamAnthropic({ apiKey, model, messages, onToken, signal }) {
  const url = PROVIDER_CATALOG[PROVIDERS.ANTHROPIC].endpoint;

  // Extract system prompt if present
  let systemPrompt = '';
  const anthropicMsgs = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
    } else {
      anthropicMsgs.push({ role: m.role, content: m.content });
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: anthropicMsgs,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(dataStr);
        if (json.type === 'content_block_delta') {
          const token = json.delta?.text || '';
          if (token) onToken(token);
        }
      } catch { /* partial chunk */ }
    }
  }
}

/**
 * Stream completion for Google Gemini API
 */
async function streamGemini({ apiKey, model, messages, onToken, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  const text = data?.[0]?.candidates?.[0]?.content?.parts?.[0]?.text || data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (text) onToken(text);
}
