# Handoff Report: Local Model Support (Milestone 3)

## 1. Observation

- **Project files and requirements**:
  - Global project description located at `/home/christopher/.gemini/antigravity/scratch/hey-buddy/PROJECT.md`.
  - Milestone 3 scope file located at `/home/christopher/.gemini/antigravity/scratch/hey-buddy/.agents/sub_orch_m3_local_model/scope.md`.
- **Master build files**:
  - `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js` (88 lines, defines `MODEL_CATALOG` and `MAX_DOWNLOAD_MB`).
  - `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js` (111 lines, exports `preflight(model)`).
  - `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js` (96 lines, exports `resolveLocalOptions()` and `localChat()`).
- **Workspace integration files**:
  - `app/js/providers.js` defines the `PROVIDERS` object and the `streamChat` function.
  - `app/js/app.js` handles initialization, setup modal save, and provider/model dropdown logic.
  - `app/index.html` defines the static provider picker options:
    ```html
    <select id="providerSelect" class="form-select" aria-required="true">
      <option value="openai">OpenAI (GPT-4o, GPT-4o mini)</option>
      <option value="anthropic">Anthropic (Claude)</option>
      <option value="google">Google (Gemini)</option>
      <option value="openrouter">OpenRouter (any model)</option>
    </select>
    ```

---

## 2. Logic Chain

- **Local Options Resolution**:
  - Calling `resolveLocalOptions()` (imported from `./local-provider.js`) during `init()` in `app.js` will resolve to either `{ mode: 'own', ... }` or `{ mode: 'fallback', ... }`.
  - Checking `opts.mode === 'own'` indicates `local.detected` is true. Thus, adding "Local (Ollama/LM Studio)" to `providerSelect` should be done conditionally based on this check.
  - If `opts.mode === 'fallback'`, a local server is not running. The fallback option "Local (Offline Fallback)" is added instead, and the catalog models are filtered using `catalogFor(detectDeviceKind())` (imported from `model-catalog.js` and `device-guard.js` respectively) to display only mobile-safe models on phones, and all models on desktop.
- **Provider & Chat Routing**:
  - Registering a placeholder `local` provider within `PROVIDERS` in `providers.js` and routing `local` in `streamChat` to a helper function wrapping `localChat` will cleanly integrate the streaming chat pipeline.
  - Using the encrypted `apiKey` field in the database to store the resolved local server base URL (e.g. `http://localhost:11434/v1` or `http://localhost:1234/v1`) allows the app to dynamically direct requests without requiring a separate database schema change.
- **UI and Pre-flight Verification**:
  - Hiding the API key input field in the Setup Modal when `local` is selected prevents validation errors, while maintaining the passphrase input preserves secure local data encryption.
  - Calling `preflight(model)` within the save event handler in `app.js` ensures that both RAM and storage space are validated before the model settings are stored.
  - Since `preflight` relies on `canDownload` which blocks any model with `sizeMb > MAX_DOWNLOAD_MB`, the hard ceiling limit is automatically and reliably enforced.

---

## 3. Caveats

- **WASM execution wrapper**: Browser sandbox limitations prevent direct native execution of large models in pure web environments without native wrappers (Tauri, Capacitor, or React Native). Fallback execution is designed to be delegated to these wrappers or simulated.
- **Dynamic provider insertion order**: Appending the local option dynamically to the DOM after startup resolution means it appears at the bottom of the list, which is the expected behavior.

---

## 4. Conclusion

The codebase is ready for integration of Local Model Support. The file `analysis.md` provides an exact diff and step-by-step change log that can be safely applied by the Implementer agent. All interfaces align with the current architecture.

---

## 5. Verification Method

To verify the modifications:
1. **Dynamic Dropdowns**: Check the settings dropdown with and without Ollama/LM Studio running on the host. Verify that "Local (Ollama/LM Studio)" or "Local (Offline Fallback)" is populated correctly.
2. **Device-gated Catalog**: Emulate a mobile device in Chrome DevTools and verify that `llama3.2-3b-instruct-q4` (3B desktop model) is hidden.
3. **Pre-flight & Ceiling**: Select a fallback model, trigger the save button, and verify that the preflight checks run and reject any model that fails quota or exceeds `MAX_DOWNLOAD_MB` (verified via unit test hooks or simulated free memory values).
