# Original User Request

## Initial Request — 2026-07-05T00:48:31-06:00

Hey Buddy is a privacy-first AI companion platform (PWA-first) with five buddy personas, a daily mystery game (The Oracle), and a real-world community scavenger hunt. The web app shell is built. This task integrates 15 verified ES modules from the master build zip into the existing app, wires them in, and ensures the Nexus Security Gate passes on every change.

Working directory: /home/christopher/.gemini/antigravity/scratch/hey-buddy

Source files to copy from (already on disk):
/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/

## What's Already Built

- security/storage.js — AES-256-GCM IndexedDB storage
- security/crypto.js — API key encryption
- security/guardrails.js — Persona guardrails engine
- scripts/nexus-gate.mjs — Security gate (zero-dependency Node scanner)
- index.html + css/landing.css + js/landing.js — Landing page
- app/index.html — App shell HTML
- app/css/app.css — App CSS with per-persona color theming
- app/js/providers.js — OpenAI/Anthropic/Google/OpenRouter streaming adapters
- app/js/app.js — Main app orchestrator

## Requirements

### R1. PWA — Make Hey Buddy installable on any phone in one tap

Copy from zip: app/manifest.json, app/service-worker.js, app/icons/ (full icon set).
Copy app/js/pwa-install.js.
Add required head meta tags to app/index.html:
  - <link rel="manifest" href="/manifest.json" />
  - <meta name="theme-color" content="#0f1220" />
  - <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  - <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" />
  - <meta name="apple-mobile-web-app-capable" content="yes" />
  - <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  - <meta name="apple-mobile-web-app-title" content="Hey Buddy" />
Wire in app/js/app.js: import and call registerServiceWorker() + setupInstall() from pwa-install.js on startup.
Service worker must NEVER cache API keys, model files, or provider responses.
Add an optional install button (#installBtn) to the app header.

### R2. Sandbox notice — First-run disclaimer

Copy app/js/sandbox-notice.js and app/css/sandbox-notice.css from zip.
Add stylesheet link to app/index.html head.
Wire in app/js/app.js: import showSandboxNotice from sandbox-notice.js; call it after DOM ready, before showing chat.
Must show once on first visit, never again (localStorage-remembered).

### R3. Local model support

Copy app/js/model-catalog.js, app/js/device-guard.js, app/js/local-provider.js from zip.
Wire into providers.js or app.js: on startup call resolveLocalOptions().
If local.detected: add "Local (Ollama/LM Studio)" to provider picker.
If not detected: show guarded catalog (phone-appropriate models only — no desktop models on mobile).
Always call preflight(model) before any download or load — block if not safe.
Nothing above MAX_DOWNLOAD_MB may be downloadable in the UI.

### R4. Voice — Self-hosted TTS

Copy app/js/tts-engine.js, app/js/voice-meter.js, app/js/voice-elevenlabs.js from zip.
Wire voice-meter.js: call checkVoice() BEFORE any TTS call; call recordVoiceUsage() after.
Wire tts-engine.js: call speak() when voice is enabled and tier allows it.
ElevenLabs key stored encrypted via existing crypto.js — never plaintext.
Voice budgets enforced: free=6k chars, trial=60k, member=120k/mo.

### R5. Tiering

Copy app/js/tier-config.js from zip.
Wire into app.js: import TIERS, getTier, membershipCheckout, shouldPersist from tier-config.js.
Gate Oracle, long memory, voice beyond free budget to trial/member.
Free tier conversations NOT saved server-side (shouldPersist() returns false for 'free').
Show tasteful upgrade prompts (not aggressive) at tier gates.

### R6. Custom personas — Device-only, encrypted, exportable

Copy app/js/persona-vault.js and app/js/persona-guard.js from zip.
persona-vault.js uses existing crypto.js (pass it in — do not re-implement encryption).
Call reviewPersona() at persona creation time before saving.
compose every custom persona's system prompt via composeSystemPrompt() — SAFETY_BASELINE always prepended.
Export/import produces a portable file for cross-device use.
clearServerCache() fires on close, sign-out, and after export.

### R7. Phone → PC Bridge — Phase A only

Copy app/js/bridge-client.js from zip.
Add "Your PC" as a provider option in the provider picker.
Phase A: LAN-direct only (http://<pc-lan-ip>:<port>/v1).
Show a "🔗 Connected to PC" badge in the chat header when bridge is active.
pokeAgentTask() stub: wired but non-critical — no UI for Phase C yet.

### R8. Security gate must pass

After all modules are wired, run: node scripts/nexus-gate.mjs --all
Must exit 0 (or only advisory findings — no blocking).
Update nexus-gate.config.json allowNet to include:
  api.elevenlabs.io, cdn-lfs.huggingface.co (already in zip's version)
No API keys or secrets hardcoded anywhere.

## Acceptance Criteria

### PWA
- [ ] Chrome DevTools → Application → Manifest shows Hey Buddy with all icons
- [ ] Android Chrome shows Add to Home Screen prompt
- [ ] iOS: correct apple-touch-icon + full-screen launch from home screen
- [ ] Offline: app shell loads gracefully

### Sandbox notice
- [ ] First visit: modal appears before chat
- [ ] Dismissed: never appears again in same browser

### Local model
- [ ] Ollama running: "Local" appears in provider picker; catalog hidden
- [ ] No local server: guarded catalog shown; desktop models hidden on mobile
- [ ] Oversized model: friendly error, no download starts

### Voice
- [ ] Free: ≤6k chars voice then upgrade nudge (no TTS call after cap)
- [ ] speak() uses Chatterbox, auto-falls back to Kokoro
- [ ] ElevenLabs key stored encrypted

### Tiers
- [ ] Free: Oracle locked, voice capped, chats not saved
- [ ] Trial/Member: Oracle unlocked, full voice, long memory

### Custom personas
- [ ] reviewPersona() blocks NSFW/harm at creation
- [ ] Encrypted round-trip: save → reload works
- [ ] Export file → import on same/other device restores persona
- [ ] Every custom persona system prompt begins with SAFETY_BASELINE

### Bridge
- [ ] PC server on LAN: "Your PC" in provider picker
- [ ] Bridge active: "🔗 Connected to PC" badge visible
- [ ] PC unreachable: graceful fallback, no crash

### Security gate
- [ ] node scripts/nexus-gate.mjs --all exits 0
- [ ] No hardcoded secrets
- [ ] No unauthorized outbound hosts

## Integrity mode: development
