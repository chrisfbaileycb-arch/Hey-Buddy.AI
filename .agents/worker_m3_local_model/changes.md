# Code Changes — Milestone 3 (Local Model Support)

## Copied Files
- `app/js/model-catalog.js` copied/overwritten with the master version. It contains the GGUF model definitions and device limits (ceilings).
- `app/js/device-guard.js` (verbatim identical to master) contains free space and memory estimation safeguards.
- `app/js/local-provider.js` (verbatim identical to master) contains Ollama/LM Studio local endpoint discovery and streaming local chat completions.

## Modified Files

### `app/js/providers.js`
- Imported `localChat` from `./local-provider.js`.
- Registered `local` in `PROVIDERS` with Ollama docs URL and empty models array (to be dynamically populated).
- Added `local` provider case in `streamChat` to call `_streamLocal`.
- Implemented `_streamLocal` to map system prompt and messages, and route the request to `localChat`.

### `app/js/app.js`
- Imported `getModel` and `MAX_DOWNLOAD_MB` from `./model-catalog.js`.
- Updated `init()`'s `resolveLocalOptions().then(...)` to append the local option to `dom.providerSelect` with dynamic labels ("Local (Ollama/LM Studio)" or "Local (Offline Fallback)").
- Dynamically populated `PROVIDERS.local.models` on discovery, mapping candidates/models as appropriate.
- Restored saved `local` provider/model selections on application boot.
- Modified `updateModelOptions` to hide the API key group container (`closest('.form-group')`) when `'local'` is selected, and show it for other providers.
- Adjusted the setup save button event listener to skip the API key requirement when provider is `'local'`, enforce the passphrase requirement (>= 8 chars), and perform preflight verification when using local offline fallback mode (blocking save or showing warnings).
- Modified `saveApiKey` to encrypt the local server's endpoint base URL as the "API key" if the provider is `'local'`.
- Modified `sendMessage` to check preflight resource limits before starting streaming if using local offline fallback mode (blocking stream if verdict is `'block'`).
- Customized the stream chat catch block to recommend checking local server and CORS configuration when the local provider fails.
