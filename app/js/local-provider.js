/**
 * local-provider.js — "Local (this device)" provider for Hey Buddy.
 *
 * Priority order (per Christopher):
 *   1. Use YOUR OWN model already running on this system, if we can find one.
 *   2. If none, offer the small curated fallback models (device-guarded).
 *
 * "Your own model" = any OpenAI-compatible local server already running on the
 * machine — Ollama, LM Studio, llama.cpp server, Jan, etc. They all expose the
 * same /v1 API shape the rest of Hey Buddy already speaks, so no new chat code
 * is needed. This keeps the app un-bloated: we reuse what the user has.
 */

import { detectDeviceKind } from './device-guard.js';
import { catalogFor } from './model-catalog.js';

// Common local OpenAI-compatible endpoints to probe (localhost only — safe).
const LOCAL_ENDPOINTS = [
  { name: 'Ollama',    base: 'http://localhost:11434/v1' },
  { name: 'LM Studio', base: 'http://localhost:1234/v1'  },
  { name: 'llama.cpp', base: 'http://localhost:8080/v1'  },
  { name: 'Jan',       base: 'http://localhost:1337/v1'  },
];

/**
 * Detect a local model server the user is already running.
 * Returns { found, endpoint, models } — never throws.
 */
export async function detectLocalServer() {
  for (const ep of LOCAL_ENDPOINTS) {
    try {
      const res = await fetch(`${ep.base}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(1200),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
      if (models.length) return { found: true, endpoint: ep, models };
    } catch { /* not running here; try next */ }
  }
  return { found: false, endpoint: null, models: [] };
}

/**
 * Resolve what the "Local" provider should offer on this device.
 * Returns:
 *   { mode: 'own',      endpoint, models }         -> use the user's own server
 *   { mode: 'fallback', candidates }               -> offer guarded catalog
 */
export async function resolveLocalOptions() {
  const own = await detectLocalServer();
  if (own.found) return { mode: 'own', endpoint: own.endpoint, models: own.models };

  const kind = detectDeviceKind();
  return { mode: 'fallback', candidates: catalogFor(kind), deviceKind: kind };
}

/**
 * Chat completion against a local OpenAI-compatible server (streaming).
 * Mirrors the signature of the existing cloud providers so app.js can call it
 * identically. `onToken` is invoked with each streamed chunk.
 */
export async function localChat({ base, model, messages, onToken, signal }) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Local model error (${res.status}). Is your local server still running?`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const tok = json.choices?.[0]?.delta?.content || '';
        if (tok) onToken(tok);
      } catch { /* keep-alive / partial line */ }
    }
  }
}
