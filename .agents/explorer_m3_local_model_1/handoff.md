# Handoff Report - Explorer 1 (Milestone 3: Local Model Support)

## 1. Observation
* **Global Project Description**: `PROJECT.md` line 25:
  `| 3 | Milestone 3: Local Model Support | app/js/model-catalog.js, app/js/device-guard.js, app/js/local-provider.js | none | IN_PROGRESS (315314e5-2e8a-4d6b-b265-7dd0a5e1dd15) |`
* **Milestone Scope**: `.agents/sub_orch_m3_local_model/scope.md` lines 11-17:
  ```markdown
  11: 1. Copy `app/js/model-catalog.js`, `app/js/device-guard.js`, and `app/js/local-provider.js` from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/` to the workspace.
  12: 2. Wire local options into `app/js/providers.js` or `app/js/app.js`:
  13:    - Call `resolveLocalOptions()` on startup.
  14:    - If `local.detected`: add "Local (Ollama/LM Studio)" to the provider picker option list in `app/js/app.js` or `providers.js`.
  15:    - If local server is not detected: display the guarded catalog options (only phone-safe / phone-ok models, hide desktop-only models on mobile devices).
  16:    - Before starting any model download or load, call `preflight(model)` to verify adequate storage and memory. Block and display a clean warning/error UI if the device fails the check.
  17:    - Enforce that no model size exceeding `MAX_DOWNLOAD_MB` is allowed for download.
  ```
* **Master Build Local Files**:
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js` (lines 19-72 define `MODEL_CATALOG` with tiers `phone-safe`, `phone-ok`, `desktop`, and line 75 defines `MAX_DOWNLOAD_MB`).
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js` (defines `detectDeviceKind()`, `getFreeSpaceMb()`, `getApproxRamMb()`, `canDownload(model)`, `canLoad(model)`, and `preflight(model)`).
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js` (defines `detectLocalServer()`, `resolveLocalOptions()`, and `localChat({ base, model, messages, onToken, signal })`).
* **Workspace Files**:
  * `app/js/app.js` (line 241 already calls `resolveLocalOptions()`, but the resolved option list is not appended to the select dropdown, nor are fallback/ceiling/preflight/CORS error validations wired in).
  * `app/js/providers.js` (defines `PROVIDERS` and `streamChat()`, but does not contain a `local` provider or stream handling for it).
  * `scripts/nexus-gate.mjs` (line 96 includes `'localhost', '127.0.0.1'` in `DEFAULT_NET_ALLOW`, meaning local connections are allowed by default).

---

## 2. Logic Chain
1. **Copying Files**: The first task is to copy `model-catalog.js`, `device-guard.js`, and `local-provider.js` from the master build extraction path to `app/js/`. Suggesting standard `cp` commands accomplishes this.
2. **Wiring Providers**: To enable the local provider option, we must define it inside `PROVIDERS` in `providers.js` and extend `streamChat` to accept a `localBase` property and a `local` case. The `local` case must invoke a helper `_streamLocal` which delegates execution to `localChat` from `local-provider.js`.
3. **Startup Initialization**: In `app.js`'s `init()`, we must handle the promise returned by `resolveLocalOptions()`. If `opts.mode === 'own'` (local server detected), we add `"Local (Ollama/LM Studio)"` to the provider picker option list. If `opts.mode === 'fallback'` (local server not detected), we add `"Local (Offline Catalog)"` to the provider picker.
4. **Guarded Model Options**: In `updateModelOptions(providerId)`, if `providerId === 'local'`, we hide the API key field in the UI. If `mode === 'own'`, we list the models returned from the local server. If `mode === 'fallback'`, we populate the model dropdown with `candidates` which are already filtered for the device kind (excluding desktop models on mobile devices).
5. **Preflight and Size Limits**: In the Save handler, when the provider is `local` and `mode === 'fallback'`, we look up the model using `getModel(model)` and call `await preflight(modelObj)`. This automatically tests `canDownload` and `canLoad`. If `!check.ok`, the check has failed due to storage or memory constraints, or because the model exceeds `MAX_DOWNLOAD_MB` (enforced inside `canDownload`). We block saving and display `showError(dom.setupError, reason)`. If `verdict === 'warn'`, we show a warning toast.
6. **Passphrase and Offline Storage**: Because the database layer requires a passphrase and saves encrypted keys, we bypass key validation for local providers but pass a dummy key (`"local-placeholder-key"`) to `saveApiKey`, which stores the local provider configuration securely under the same passphrase unlock mechanism.
7. **Connection Error Customization**: When `localChat` fails because the server isn't running or CORS isn't enabled, the exception is caught in `sendMessage()`. Displaying a specific instruction message instead of a generic "check your API key" message makes it actionable for local users.

---

## 3. Caveats
* **Detection Timing**: `resolveLocalOptions()` runs asynchronously on startup. If a user opens settings within a split second of the page loading, `state.localOptions` might be null. The UI dropdown population logic checks for this state and displays a fallback notice if it is not yet resolved.
* **CORS**: Users running Ollama or LM Studio must have CORS configured (e.g. `OLLAMA_ORIGINS="*"`) to allow fetch requests from a browser/PWA on a different port. This is noted in the custom error handler.

---

## 4. Conclusion
Integrating local model support requires copying the three master build files to `app/js/` and making localized changes to `app/js/providers.js` and `app/js/app.js`. This wires up local options dynamically, manages both local servers and fallback catalogs, enforces device guard memory and space constraints, hides irrelevant inputs (API Key), and maintains database compatibility.

---

## 5. Verification Method
1. **Copy Files**: Verify that `model-catalog.js`, `device-guard.js`, and `local-provider.js` are in `app/js/` and match the master versions.
2. **Syntax/Lint check**: Run the project security scanner `node scripts/nexus-gate.mjs --all` to verify that there are no syntax errors, linting warnings, or unauthorized network calls (the localhost addresses are on the default allowlist).
3. **UI Verification**:
   * If an Ollama/LM Studio server is running locally on port 11434/1234, verify that the option `"Local (Ollama/LM Studio)"` appears in the provider dropdown and displays the server's models.
   * If no server is running, verify that the option `"Local (Offline Catalog)"` appears, showing only mobile-safe models on mobile (no Llama 3.2 3B) and all models on desktop.
   * Verify that the API Key input row is hidden when the Local provider is selected.
   * Verify that choosing a model that violates storage/RAM preflight shows a block error in the modal and prevents saving.
4. **Execution Verification**: Start a chat using the local provider and verify that tokens stream into the chat UI correctly.
