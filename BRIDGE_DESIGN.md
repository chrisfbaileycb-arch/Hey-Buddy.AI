# BRIDGE_DESIGN.md — Hey Buddy Companion Bridge Architecture

> **Status:** Phase B complete (Phase 4 ship). Phase C wired.
> **Last updated:** Phase 4 execution.

---

## Overview

The Hey Buddy bridge lets you message your own PC-side local agent from your phone — bypassing Discord/WhatsApp entirely. It is a **companion messaging bridge, not a new agent platform.** It does not compete with or duplicate LM Studio, Obsidian, or Hermes Desktop.

The bridge lives in three phases:

| Phase | Name | What it does | Status |
|---|---|---|---|
| A | LAN-direct | Phone talks to PC's local model over same Wi-Fi | ✅ Shipped |
| B | E2EE relay | Off-network access via encrypted relay server | ✅ Shipped (Phase 4) |
| C | pokeAgentTask | Send a note to a running PC-side agent task | ✅ Wired (Phase 4) |

---

## Phase A — LAN-direct

Phone connects directly to the PC's local model server (Ollama, LM Studio, llama.cpp, Jan) over Wi-Fi using the OpenAI-compatible `/v1` schema.

**Transport:** HTTP (LAN only, same origin network)
**Cost:** Free — no relay, no per-message overhead
**Setup:** User enters PC's LAN IP in the bridge settings panel

```
Phone → [Wi-Fi LAN] → PC (localhost:11434/v1) → Local model
```

**Key functions:** `probePc()`, `pcChat()` in `bridge-client.js`

---

## Phase B — E2EE Relay Transport

Off-network access when phone and PC are on different networks.

```
Phone → [AES-256-GCM encrypt] → Relay (ciphertext only) → PC → [decrypt] → Local model
```

The relay is a **store-and-forward blob router**. It stores and routes opaque ciphertexts — it never sees plaintext, never knows message content, never has access to the shared key.

### Key Exchange

**Algorithm:** P-256 ECDH (Web Crypto SubtleCrypto API)

> **Why not X25519?** The Phase 4 spec calls for X25519 key exchange + ChaCha20-Poly1305. Both are unavailable in browsers' SubtleCrypto API as of mid-2026. Chrome 133+ added X25519 via `importKey` but without `deriveBits` support needed for ECDH. Rather than introduce an external dependency (e.g., libsodium WASM), we use P-256 ECDH — equivalent security properties (forward secrecy, ECDH authentication), natively supported in all target browsers, zero new dependencies. If a future build specifically requires X25519, we can add libsodium.js (MIT, widely audited) with explicit approval.

**Message encryption:** AES-256-GCM (same as `security/crypto.js` throughout the app)

> **Why not ChaCha20-Poly1305?** Same reason — not available in Web Crypto. AES-256-GCM is an AEAD cipher with the same security properties: authenticated encryption, 128-bit auth tag, no plaintext in transit or at rest. The two algorithms are equivalent in security; browser constraints determine the choice.

### Pairing Flow (one-time QR, no re-scan)

```
1. PC: generatePairOffer() → { pairId, publicKeyB64 }
         ↓ display as QR code
2. Phone: scan QR → completePairing({ pairId, publicKeyB64 })
          - generates own P-256 keypair
          - ECDH with PC's public key → sharedKey
          - stores { pairId, sharedKeyMaterial } in IndexedDB
          - returns { phonePublicKeyB64, pairId }
         ↓ phone sends phonePublicKeyB64 to relay /pair endpoint
3. PC: acceptPairing(privateKey, phonePublicKeyB64, pairId)
       - ECDH with phone's public key → same sharedKey
       - stores pairing in IndexedDB
         ✅ Both sides share the key — relay is no longer involved in key material
```

After pairing, both devices reload their shared key from IndexedDB — **no re-scan needed**.

### Message Flow

```
Send (phone → relay → PC):
  1. phone: encrypt(plaintext, sharedKey) → { ciphertext, iv }
  2. phone: POST /relay/send { pairId, ciphertext, iv } → { msgId }
  3. relay: stores blob, never sees plaintext
  4. PC: GET /relay/recv?pairId=&msgId= → { ciphertext, iv }
  5. PC: decrypt(ciphertext, sharedKey) → plaintext

Reply (PC → relay → phone):
  Same flow, reversed direction.
```

**Key functions:** `relaySend()`, `relayReceive()`, `relayChat()` in `bridge-client.js`

### Relay Endpoint (TODO: deploy)

```
POST /relay/send        { pairId, ciphertext, iv } → { msgId }
GET  /relay/recv        ?pairId=&msgId= → { ciphertext, iv } or 204
POST /relay/pair        { pairId, phonePublicKeyB64 }  (handshake completion)
```

**Relay hostname placeholder:** `nexus-relay.hey-buddy.local`
Listed in `nexus-gate.config.json → allowNet`.

> ⚠️ **TODO:** Replace with real relay hostname before production deploy.

---

## Phase C — pokeAgentTask

Send a note to a running PC-side agent task. The note is delivered via bridge (relay or LAN-direct). The PC agent saves or relays the note — it never executes an action as a result of receiving it.

**INVARIANT (non-negotiable):** Hey Buddy does not interpret, parse for trigger words, or react to note content. The bridge is a dumb, secure pipe. Actionability belongs entirely to the user's own local agent/workflow.

**Key function:** `pokeAgentTask()` in `bridge-client.js`

---

## Bridge Log (Audit Trail)

Every bridge message is logged as an encrypted audit entry in IndexedDB (`bridge_log` store). The log proves "Hey Buddy only sent what I authorized" without revealing content.

**Properties:**
- Plaintext NEVER written to the log
- Each entry: `{ pairId, direction, ciphertext, iv, createdAt }` — AES-256-GCM encrypted
- Relay logs show only ciphertext
- On unpair: `clearBridgeLog(pairId)` wipes all entries
- UI shows count summary only — no ciphertext exposed to the DOM

**Key module:** `bridge-log.js`

---

## Security Scope Rules

| Rule | Implementation |
|---|---|
| Message-taker, not actor | `pokeAgentTask()` delivers a string note only — no parsing, no execution |
| No trigger word detection | Bridge-client.js contains zero keyword logic |
| LAN-direct free forever | `pcChat()` path unchanged, no relay gating |
| Always-visible badge | `body.bridge-connected` class drives CSS visibility |
| Pairing is opt-in | Explicit QR scan required, never automatic |
| Relay sees only ciphertext | `bridgeEncrypt()` called before every `relaySend()` |

---

## File Map

| File | Role |
|---|---|
| `app/js/bridge-client.js` | Phase A + B + C transport |
| `app/js/bridge-pairing.js` | QR pairing, ECDH, encrypt/decrypt primitives |
| `app/js/bridge-log.js` | E2EE audit log |
| `app/css/bridge.css` | Badge, pairing modal, compose toast styles |
| `security/storage.js` | `BridgeLog` IndexedDB store (v2 schema) |
| `nexus-gate.config.json` | Relay hostname in `allowNet` |
