/**
 * bridge-client.js — Phone → PC bridge client (Phase A + Phase B).
 *
 * PHASE A — LAN-direct (already shipped)
 * ────────────────────────────────────────
 * Phone talks to the PC's local model directly over Wi-Fi using the
 * OpenAI-compatible /v1 schema. Zero cost, zero relay. This stays free.
 * Functions: probePc(), pcChat()
 *
 * PHASE B — E2EE relay transport (Phase 4)
 * ──────────────────────────────────────────
 * Off-network access via a relay server. The relay routes opaque blobs only —
 * it never sees plaintext. Encryption is AES-256-GCM with a shared key derived
 * from P-256 ECDH during the one-time QR pairing. Same chat call signature as
 * LAN-direct so the rest of the app needs zero changes.
 * See BRIDGE_DESIGN.md §3 for algorithm rationale (why P-256 ECDH + AES-256-GCM
 * instead of X25519 + ChaCha20-Poly1305 — both are AEAD with forward secrecy;
 * the Web Crypto API determines which is available in the browser).
 * Functions: relayChat(), relaySend(), relayReceive()
 *
 * PHASE C — pokeAgentTask() (stub → real in Phase 4)
 * ────────────────────────────────────────────────────
 * Send a note to a running PC-side agent task. The bridge is a dumb, secure
 * pipe — it never interprets, parses for trigger words, or executes actions.
 * Actionability lives entirely in the user's own local agent/workflow.
 *
 * SECURITY INVARIANTS
 * ────────────────────
 * • PC LAN address + pairing secrets: stored via storage.js keychain, never hardcoded.
 * • Relay URL: set via nexus-gate.config.json allowNet. Placeholder until deployed.
 * • All relay payloads are AES-256-GCM encrypted before leaving the device.
 * • Relay logs show only ciphertext — no plaintext ever touches the relay.
 *
 * TODO: Replace RELAY_HOST_ORIGIN placeholder with real relay hostname before production.
 */

import { bridgeEncrypt, bridgeDecrypt } from './bridge-pairing.js';
import { logBridgeMessage } from './bridge-log.js';

const PROBE_TIMEOUT_MS  = 1500;
const RELAY_TIMEOUT_MS  = 10_000;
const RELAY_POLL_MS     = 2_000;   // how often to poll relay for replies
const RELAY_MAX_POLLS   = 15;      // give up after ~30 seconds

// TODO: Replace with real relay hostname before deploy.
// Must also be listed in nexus-gate.config.json → allowNet.
const RELAY_HOST_ORIGIN = 'https://nexus-relay.hey-buddy.local'; // TODO: real host

// ── Phase A: LAN-direct ──────────────────────────────────────────────────────

/**
 * Check the paired PC is reachable on the LAN and return its models.
 * `base` example: 'http://192.168.1.50:11434/v1'
 */
export async function probePc(base) {
  try {
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json();
    const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
    return { online: true, models };
  } catch {
    return { online: false, models: [] };
  }
}

/**
 * Stream a chat completion from the PC's model over the LAN.
 * Same signature as localChat / cloud providers — drop-in for app.js.
 * If the PC drops, throws a friendly error so the app can offer to fall back
 * to the phone's small on-device model.
 */
export async function pcChat({ base, model, messages, onToken, signal }) {
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch {
    throw new Error("Can't reach your PC. Make sure it's on the same Wi-Fi and Hey Buddy Bridge is running there. You can keep chatting with your on-device buddy instead.");
  }
  if (!res.ok || !res.body) {
    throw new Error(`Your PC's model returned an error (${res.status}).`);
  }

  const reader  = res.body.getReader();
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
        const tok = JSON.parse(payload).choices?.[0]?.delta?.content || '';
        if (tok) onToken(tok);
      } catch { /* partial chunk */ }
    }
  }
}

// ── Phase B: E2EE relay transport ────────────────────────────────────────────

/**
 * Send an encrypted blob to the relay for the paired device.
 *
 * The relay stores the ciphertext keyed by pairId and a msgId it returns.
 * Neither the relay nor any third party can read the payload.
 *
 * @param {{ pairId: string, sharedKey: CryptoKey, payload: string, signal?: AbortSignal }} opts
 * @returns {Promise<{ msgId: string }>}
 */
export async function relaySend({ pairId, sharedKey, payload, signal }) {
  const { ciphertext, iv } = await bridgeEncrypt(payload, sharedKey);

  const res = await fetch(`${RELAY_HOST_ORIGIN}/relay/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ pairId, ciphertext, iv }),
    signal:  signal ?? AbortSignal.timeout(RELAY_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Relay send failed (${res.status}): ${body.slice(0, 120)}`);
  }

  return res.json(); // { msgId }
}

/**
 * Poll the relay for a reply message and decrypt it.
 *
 * @param {{ pairId: string, sharedKey: CryptoKey, msgId: string, signal?: AbortSignal }} opts
 * @returns {Promise<string>} - Decrypted plaintext reply
 */
export async function relayReceive({ pairId, sharedKey, msgId, signal }) {
  for (let attempt = 0; attempt < RELAY_MAX_POLLS; attempt++) {
    await new Promise(r => setTimeout(r, RELAY_POLL_MS));

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(
      `${RELAY_HOST_ORIGIN}/relay/recv?pairId=${encodeURIComponent(pairId)}&msgId=${encodeURIComponent(msgId)}`,
      { signal: signal ?? AbortSignal.timeout(RELAY_TIMEOUT_MS) }
    );

    if (res.status === 204) continue;  // no reply yet — keep polling
    if (!res.ok) throw new Error(`Relay recv failed (${res.status}).`);

    const { ciphertext, iv } = await res.json();
    return bridgeDecrypt({ ciphertext, iv }, sharedKey);
  }

  throw new Error("Your PC didn't respond in time. It may be asleep or offline.");
}

/**
 * Stream a chat completion from the PC's model via the E2EE relay.
 *
 * Same call signature as pcChat() — app.js switches between them transparently
 * based on state.relayMode. The relay path does NOT support true streaming
 * (the relay is a store-and-forward system); tokens are batched and delivered
 * as a single reply. onToken is called once with the full reply to maintain
 * API compatibility.
 *
 * @param {{ pairId: string, sharedKey: CryptoKey, model: string, messages: Array,
 *            onToken: Function, signal?: AbortSignal }} opts
 */
export async function relayChat({ pairId, sharedKey, model, messages, onToken, signal }) {
  const payload = JSON.stringify({ type: 'chat', model, messages });

  // Send the encrypted chat request to the relay
  const { msgId } = await relaySend({ pairId, sharedKey, payload, signal });

  // Wait for the PC's encrypted reply
  const reply = await relayReceive({ pairId, sharedKey, msgId, signal });

  // Parse and deliver — same interface as streaming onToken calls
  let content = reply;
  try {
    const parsed = JSON.parse(reply);
    content = parsed.choices?.[0]?.message?.content ?? parsed.reply ?? reply;
  } catch { /* reply is already plaintext */ }

  onToken(content);
}

// ── Phase C: pokeAgentTask (stub → real) ─────────────────────────────────────

/**
 * Send a note to a running PC-side agent task and return its latest status.
 *
 * BRIDGE RULE — message-taker, not actor:
 *   This function delivers a note string to the PC agent. The agent saves or
 *   relays that note. It NEVER executes an action as a result of receiving it.
 *   Hey Buddy does not parse the note for trigger words. Actionability lives
 *   entirely in the user's own local agent/workflow.
 *
 * Transport selection:
 *   - If relayMode=true and sharedKey is provided → E2EE relay path
 *   - Otherwise → direct LAN HTTP POST (Phase A path)
 *
 * @param {{ base: string, taskId: string, message: string,
 *            relayMode?: boolean, pairId?: string, sharedKey?: CryptoKey,
 *            signal?: AbortSignal }} opts
 * @returns {Promise<{ status: string, progress: number, reply: string }>}
 */
export async function pokeAgentTask({ base, taskId, message, relayMode, pairId, sharedKey, signal }) {
  if (relayMode && pairId && sharedKey) {
    // E2EE relay path — note is encrypted before leaving device
    const payload = JSON.stringify({ type: 'agent_note', taskId, message });
    const { msgId } = await relaySend({ pairId, sharedKey, payload, signal });
    const reply = await relayReceive({ pairId, sharedKey, msgId, signal });

    let result = { status: 'delivered', progress: 0, reply };
    try { result = JSON.parse(reply); } catch { /* use defaults */ }
    return result;
  }

  // LAN-direct path (original Phase A stub — now real)
  const res = await fetch(`${base.replace(/\/v1$/, '')}/agent/task/${encodeURIComponent(taskId)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message }),
    signal,
  });
  if (!res.ok) throw new Error(`Agent task unreachable (${res.status}).`);
  return res.json(); // { status, progress, reply }
}
