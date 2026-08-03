/**
 * tts-engine.js — self-hosted Text-to-Speech for Hey Buddy.
 *
 * PIVOT (Christopher): replace paid ElevenLabs with FREE, self-hosted, and
 * commercially-safe open-source TTS so per-use voice cost drops to ~server
 * time instead of per-character API fees.
 *
 * Engines (verified licenses — safe for a commercial product):
 *   - PRIMARY : Chatterbox (Resemble AI)  — MIT — ElevenLabs-like realism.
 *               https://github.com/resemble-ai/chatterbox
 *   - FALLBACK: Kokoro                     — Apache-2.0 — fast + lightweight.
 *               https://github.com/hexgrad/kokoro
 *
 * NOTE: "free" = no API fees, but you host it. Quality realtime TTS wants a
 * GPU. This module talks to YOUR TTS server(s) over HTTP and returns audio.
 * It mirrors the shape of voice-elevenlabs.js (speak / verify) so the app can
 * swap providers with almost no other changes.
 *
 * Per-persona voice mapping keeps the same idea as PERSONA_VOICES: each buddy
 * maps to a voice id/reference the engine understands.
 */

/** Your self-hosted endpoints. Override at init for prod. */
export const TTS_ENDPOINTS = {
  chatterbox: '/tts/chatterbox',  // POST -> audio (see contract below)
  kokoro: '/tts/kokoro',
};

/**
 * Persona -> voice reference. For Chatterbox these can be reference-audio ids
 * or names; for Kokoro these are its built-in voice ids (e.g. 'af_heart').
 * Swap for your chosen voices once your server is running.
 */
export const PERSONA_VOICES = {
  'first-responder': { chatterbox: 'calm_steady', kokoro: 'am_michael' },
  'the-drill':       { chatterbox: 'intense_male', kokoro: 'am_adam' },
  'haven':           { chatterbox: 'warm_female',  kokoro: 'af_heart' },
  'the-ledger':      { chatterbox: 'firm_neutral', kokoro: 'am_onyx' },
  'coach':           { chatterbox: 'bright_coach', kokoro: 'af_bella' },
  _default:          { chatterbox: 'warm_female',  kokoro: 'af_heart' },
};

/**
 * Server contract (implement on your TTS box):
 *   POST {endpoint}
 *   body: { text, voice, format:'mp3', speed?:1.0 }
 *   200 -> audio bytes (Content-Type: audio/mpeg), OR
 *   200 -> { audioBase64 } if you prefer JSON.
 */
async function requestTts(endpoint, { text, voice, speed = 1.0, signal, fetchImpl = fetch }) {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, format: 'mp3', speed }),
    signal,
  });
  if (!res.ok) throw new Error(`TTS ${endpoint} failed: ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = await res.json();
    const bin = Uint8Array.from(atob(j.audioBase64), (c) => c.charCodeAt(0));
    return new Blob([bin], { type: 'audio/mpeg' });
  }
  return await res.blob();
}

/** Is a given engine reachable? Use for health checks / fallback decisions. */
export async function verifyEngine(engine = 'chatterbox', endpoints = TTS_ENDPOINTS) {
  try {
    const res = await fetch(endpoints[engine], { method: 'OPTIONS' });
    return res.ok || res.status === 405; // 405 = endpoint exists, wrong method
  } catch { return false; }
}

/**
 * Speak text for a persona. Tries Chatterbox first, falls back to Kokoro.
 * Returns a playable audio Blob (also auto-plays if `play` is true).
 */
export async function speak({
  personaId = '_default',
  text,
  speed = 1.0,
  play = true,
  endpoints = TTS_ENDPOINTS,
  signal,
} = {}) {
  const map = PERSONA_VOICES[personaId] || PERSONA_VOICES._default;

  let blob;
  try {
    blob = await requestTts(endpoints.chatterbox, { text, voice: map.chatterbox, speed, signal });
  } catch (primaryErr) {
    // Fallback to the fast/light engine so voice never hard-fails.
    try {
      blob = await requestTts(endpoints.kokoro, { text, voice: map.kokoro, speed, signal });
    } catch (fallbackErr) {
      throw new Error(`All TTS engines failed: ${primaryErr.message} | ${fallbackErr.message}`);
    }
  }

  if (play) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    audio.play().catch(() => {}); // ignore autoplay-block; caller can retry on gesture
  }
  return blob;
}

/** Rough character cost — self-hosted, so this is for UX/limits, not billing. */
export function estimateCost(text = '') {
  return { chars: text.length, note: 'self-hosted: cost is server time, not per-character fees' };
}
