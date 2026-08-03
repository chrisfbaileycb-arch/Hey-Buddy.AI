# Project: Hey Buddy Integration

## Architecture
Hey Buddy is a privacy-first AI companion platform built as a Progressive Web App (PWA). It features:
- Core UI shell (app/index.html, app/css/app.css, app/js/app.js)
- Persona guardrails engine (security/guardrails.js)
- Cryptographic and IndexedDB storage layers (security/crypto.js, security/storage.js)
- 15 external ES modules to be integrated from the master build.

## Code Layout
- `index.html` - Landing page
- `css/` - Landing page styles
- `js/` - Landing page script
- `app/index.html` - Main PWA HTML app shell
- `app/css/` - App stylesheets (app.css, sandbox-notice.css)
- `app/js/` - Core application logic and ES modules
- `security/` - Storage, crypto, and safety logic
- `scripts/` - Security gate script (nexus-gate.mjs)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Milestone 1: PWA | app/manifest.json, app/service-worker.js, app/js/pwa-install.js, icons | none | DONE |
| 2 | Milestone 2: Sandbox Notice | app/js/sandbox-notice.js, app/css/sandbox-notice.css | none | DONE |
| 3 | Milestone 3: Local Model Support | app/js/model-catalog.js, app/js/device-guard.js, app/js/local-provider.js | none | IN_PROGRESS (315314e5-2e8a-4d6b-b265-7dd0a5e1dd15) |
| 4 | Milestone 4: Voice Support | app/js/tts-engine.js, app/js/voice-meter.js, app/js/voice-elevenlabs.js | none | PLANNED |
| 5 | Milestone 5: Tiering | app/js/tier-config.js | none | PLANNED |
| 6 | Milestone 6: Custom Personas | app/js/persona-vault.js, app/js/persona-guard.js | none | PLANNED |
| 7 | Milestone 7: Bridge | app/js/bridge-client.js | none | PLANNED |
| 8 | Milestone 8: Nexus Gate & Tests | Nexus Security Gate check & full verification | 1, 2, 3, 4, 5, 6, 7 | PLANNED |

## Interface Contracts
### PWA Integration
- `pwa-install.js` exports:
  - `registerServiceWorker()`: Registers service worker, skips caching sensitive data.
  - `setupInstall(button)`: Wires the home screen install trigger.

### Sandbox Notice
- `sandbox-notice.js` exports:
  - `showSandboxNotice()`: Displays first-run sandbox warning once.

### Local Model Support
- `local-provider.js` exports:
  - `resolveLocalOptions()`: Checks Ollama/LM Studio and populates catalog/picker.
  - `preflight(model)`: Validates model safety and download limits.

### Voice Support
- `tts-engine.js` exports `speak(text)`.
- `voice-meter.js` exports `checkVoice()` and `recordVoiceUsage(chars)`.

### Tiering
- `tier-config.js` exports `TIERS`, `getTier`, `membershipCheckout`, `shouldPersist`.

### Custom Personas
- `persona-vault.js` and `persona-guard.js` export persona review, baseline prompt enforcement, clear cache on close.

### Bridge
- `bridge-client.js` exports:
  - Local LAN connection to PC models.
  - Connection badge UI handler.
