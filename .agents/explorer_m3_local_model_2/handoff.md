# Handoff Report - Local Model Support (Milestone 3)

## 1. Observation
- Verified that `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js` (88 lines, 2941 bytes) exists in the master build with `MAX_DOWNLOAD_MB` and `catalogFor(deviceKind)` functions.
- Verified `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js` (111 lines, 4776 bytes) contains the `preflight(model)` and `canDownload(model)` logic.
- Verified `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js` (96 lines, 3599 bytes) contains `resolveLocalOptions()` and `localChat()` logic.
- Verified that in `app/js/app.js` line 241, `resolveLocalOptions()` is called in `init()` but is not yet wired to update the provider options:
  ```javascript
  241:   resolveLocalOptions().then((opts) => {
  242:     state.localOptions = opts;
  243:     if (opts.mode === 'own') {
  244:       console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
  245:       // Could add 'local' to provider picker here in a future pass
  246:     }
  247:   }).catch(() => {});
  ```
- Verified that in `app/js/providers.js`, `streamChat` switches on provider but doesn't handle `'local'` (lines 71-83):
  ```javascript
  71: export async function streamChat({ provider, model, apiKey, system, messages, onChunk, signal }) {
  72:   switch (provider) {
  73:     case 'openai':
  74:     case 'openrouter':
  75:       return _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal });
  76:     case 'anthropic':
  77:       return _streamAnthropic({ model, apiKey, system, messages, onChunk, signal });
  78:     case 'google':
  79:       return _streamGoogle({ model, apiKey, system, messages, onChunk, signal });
  80:     default:
  81:       throw new Error(`Unknown provider: ${provider}`);
  82:   }
  83: }
  ```
- Verified in `app/index.html` lines 259-264 that `providerSelect` has hardcoded option items:
  ```html
  259:           <select id="providerSelect" class="form-select" aria-required="true">
  260:             <option value="openai">OpenAI (GPT-4o, GPT-4o mini)</option>
  261:             <option value="anthropic">Anthropic (Claude)</option>
  262:             <option value="google">Google (Gemini)</option>
  263:             <option value="openrouter">OpenRouter (any model)</option>
  264:           </select>
  ```

---

## 2. Logic Chain
- Since the local option needs to be available in the PWA setup modal, we must dynamically insert `option value="local"` to `dom.providerSelect` on startup when `resolveLocalOptions()` resolves.
- When `opts.mode === 'own'`, local server is detected, so the model selection must list the models returned by the local server.
- When `opts.mode === 'fallback'`, local server is not detected, so the model selection list should display the device-guarded models filtered by `catalogFor(deviceKind)` (which hides desktop-tier models on mobile devices).
- Since local provider is keyless, the setup modal save action should bypass API key and encryption passphrase validation when `provider === 'local'`.
- On page load, `loadApiConfig()` should bypass the unlock screen/prompt if the saved provider is `local` because no API key is decrypted.
- Before saving a local model configuration in `fallback` mode or sending a message under `fallback` mode, calling `preflight(model)` will automatically perform compatibility checks (RAM and storage) and enforce `MAX_DOWNLOAD_MB` download limits, blocking execution and displaying errors/warnings appropriately.

---

## 3. Caveats
- If the local server is not running at startup but started later, the dropdown won't reflect the custom models automatically unless the user re-opens the Setup Modal or we add a reload trigger. Probing on provider change or setup open would handle this.
- If the device classification API is restricted/unsupported on some browsers, `detectDeviceKind()` falls back to user-agent regex matching, which is coarse but standard.

---

## 4. Conclusion
Integrating Local Model support is fully achievable with the specified code modifications without rewriting core app logic. The plan ensures that the PWA shell manages device-compatibility constraints and behaves smoothly when no local server is found.

---

## 5. Verification Method
- **Verification Command**: Since this is a browser-based application, running `npm run build` or the configured linting/build tools will verify code compilation:
  - Check with the project's build gate (e.g. `./install-hook.sh` or `nexus-gate.mjs`) to verify security and AST checks.
- **Files to Inspect**:
  - `app/js/app.js`
  - `app/js/providers.js`
  - `app/js/local-provider.js`
  - `app/js/device-guard.js`
  - `app/js/model-catalog.js`
