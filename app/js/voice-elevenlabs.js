/**
 * voice-elevenlabs.js — Optional per-persona voices via ElevenLabs TTS.
 *
 * SECURITY (matches Hey Buddy's existing key handling):
 *   - The ElevenLabs key is stored with the SAME AES-256-GCM + passphrase path
 *     as every other provider key (crypto.js / storage.js). Never hardcoded,
 *     never logged, never synced in plaintext.
 *   - api.elevenlabs.io must be added to the Nexus Security Gate allowlist
 *     (nexus-gate.config.json) or the gate will correctly block this call.
 *
 * Each buddy maps to a distinct voice. Fill voiceId with real IDs from your
 * ElevenLabs account (Voices -> copy Voice ID). Left blank = that buddy stays
 * text-only until you set one.
 */

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

// Persona -> ElevenLabs voice mapping. Set voiceId per buddy from your account.
export const PERSONA_VOICES = {
  'the-drill':      { voiceId: '', settings: { stability: 0.35, similarity_boost: 0.8 } }, // energetic
  'haven':          { voiceId: '', settings: { stability: 0.7,  similarity_boost: 0.75 } }, // warm, calm
  'the-ledger':     { voiceId: '', settings: { stability: 0.6,  similarity_boost: 0.7 } },  // precise
  'coach':          { voiceId: '', settings: { stability: 0.5,  similarity_boost: 0.75 } },
  'first-responder':{ voiceId: '', settings: { stability: 0.75, similarity_boost: 0.7 } },  // clear, steady
};

/**
 * Speak `text` in a persona's voice. Returns a playable HTMLAudioElement.
 * `apiKey` is the DECRYPTED key held only in memory for this call.
 * Fails gracefully (returns null) if no voice configured or key missing.
 */
export async function speak({ personaId, text, apiKey, model = 'eleven_turbo_v2_5', signal }) {
  const voice = PERSONA_VOICES[personaId];
  if (!voice || !voice.voiceId || !apiKey || !text) return null;

  const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${voice.voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: voice.settings,
    }),
    signal,
  });

  if (!res.ok) {
    // Never throw into the chat flow — voice is an enhancement, not a dependency.
    console.warn(`ElevenLabs TTS failed (${res.status}). Continuing text-only.`);
    return null;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  return audio;
}

/** Quick check the user can wire up in Settings to validate their key. */
export async function verifyKey(apiKey) {
  try {
    const res = await fetch(`${ELEVEN_BASE}/user`, { headers: { 'xi-api-key': apiKey } });
    return res.ok;
  } catch { return false; }
}
