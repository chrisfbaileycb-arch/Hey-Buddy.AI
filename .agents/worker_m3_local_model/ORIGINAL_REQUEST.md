## 2026-07-05T07:20:17Z

<USER_REQUEST>
**Identity**: You are the Worker for Milestone 3 (Local Model Support).
**Working Directory**: /home/christopher/.gemini/antigravity/scratch/hey-buddy/.agents/worker_m3_local_model/
**Role**: Implementation agent. Copy master files, modify providers.js and app.js, run tests and build checks, and verify security gate.

**Objective**: Complete the integration of Milestone 3: Local Model Support (R3) by copying the master build files, modifying `app/js/providers.js` and `app/js/app.js` to wire the local provider option, and verifying the implementation.

**Scope boundaries**:
- Implement ONLY what is needed to copy the three files (`model-catalog.js`, `device-guard.js`, and `local-provider.js`) and wire them into `providers.js` and `app.js` to support Ollama/LM Studio and the guarded offline fallback models.
- DO NOT edit any other modules.
- DO NOT disable security checks or lints.

**Verbatim integrity warning (MUST be included)**:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

**Input information**:
- Master files to copy from: `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/`
- Target directory: `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/`
- Codebase files to edit: `app/js/providers.js`, `app/js/app.js`

**Implementation details**:
1. **Copy Files**: Copy `model-catalog.js`, `device-guard.js`, and `local-provider.js` from the master build extraction directory to the local workspace `app/js/` folder.
2. **`app/js/providers.js` Modifications**:
   - Import `localChat` from `./local-provider.js`.
   - Add a `local` provider object in `PROVIDERS`:
     ```javascript
     local: {
       label:       'Local',
       docsUrl:     'https://ollama.com/',
       models:      [], // Dynamically populated
       defaultModel: '',
     }
     ```
   - In `streamChat`, add a case for `'local'`:
     ```javascript
     case 'local':
       return _streamLocal({ model, base: apiKey, system, messages, onChunk, signal });
     ```
     *(Note: we reuse the `apiKey` slot to pass the local server's base URL).*
   - Implement `_streamLocal`:
     ```javascript
     async function _streamLocal({ model, base, system, messages, onChunk, signal }) {
       const localMessages = [
         { role: 'system', content: system },
         ...messages.map(m => ({ role: m.role, content: m.content }))
       ];
       let full = '';
       await localChat({
         base: base || 'http://localhost:11434/v1',
         model,
         messages: localMessages,
         onToken: (chunk) => {
           full += chunk;
           onChunk(chunk);
         },
         signal,
       });
       return full;
     }
     ```
3. **`app/js/app.js` Modifications**:
   - Import `getModel` and `MAX_DOWNLOAD_MB` from `./model-catalog.js`.
   - In `init()`:
     - Locate `resolveLocalOptions().then((opts) => { ... })`.
     - Inside it, append the local option to `dom.providerSelect`.
     - If `opts.mode === 'own'`, set option text to `"Local (Ollama/LM Studio)"`, and map `opts.models` to `PROVIDERS.local.models` as `{ id: m, label: m }`.
     - If `opts.mode === 'fallback'`, set option text to `"Local (Offline Fallback)"` (or `"Local (Offline Catalog)"`), and map `opts.candidates` to `PROVIDERS.local.models` as `{ id: m.id, label: `${m.name} (${m.sizeMb}MB)` }`.
     - If the saved provider was `'local'`, call `updateModelOptions('local')` and set `dom.modelSelect.value = state.apiConfig.model`.
   - In `updateModelOptions(providerId)`:
     - Hide the API key input field container (`dom.apiKeyInput.closest('.form-group')`) if `providerId === 'local'`.
     - Show the API key input field container if `providerId !== 'local'`.
   - In `wireEvents()`, when the provider changes:
     - Call `updateModelOptions` and toggle the display of the API key group.
   - In the save settings event listener (`dom.setupSaveBtn.addEventListener('click', ...)`):
     - If `provider === 'local'`, skip the `!key` requirement check. Still require `passphrase` (at least 8 characters).
     - If `provider === 'local'` and `mode === 'fallback'`, retrieve the selected model details with `getModel(model)` and call `await preflight(modelObj)`. If preflight verdict is `'block'`, block save and show the error. If verdict is `'warn'`, show a warning (e.g. `showToast` or a clean warning message).
     - In `saveApiKey(apiKey, passphrase, provider, model)`, if `provider === 'local'`, encrypt the resolved local server base URL (`state.localOptions?.endpoint?.base` or `'http://localhost:11434/v1'`) as the "API key", saving it to IndexedDB under the `providerName: provider` column.
   - In `sendMessage()`:
     - Check pre-flight conditions before starting streaming if `state.apiConfig?.provider === 'local'` and `state.localOptions?.mode === 'fallback'`.
     - Update the stream chat `catch (err)` block: if the provider is `'local'`, show a specific warning `Make sure your local server (Ollama/LM Studio) is running and CORS is enabled.` instead of "Check your API key".
4. **Verification**:
   - Run the build/test check or run `node scripts/nexus-gate.mjs --all` to make sure all security and code syntax constraints pass cleanly.
   - Document commands run and results in your handoff report.

**Output requirements**: Write `changes.md` and `handoff.md` to your working directory `/home/christopher/.gemini/antigravity/scratch/hey-buddy/.agents/worker_m3_local_model/`.

**Completion criteria**:
- Passing build check.
- `nexus-gate.mjs` exits with 0.
- Detailed report with command logs and verification results.
</USER_REQUEST>
