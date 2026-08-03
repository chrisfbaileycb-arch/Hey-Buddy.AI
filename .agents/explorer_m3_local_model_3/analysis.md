# Analysis & Implementation Plan: Local Model Support (Milestone 3)

This report details the technical analysis and implementation plan for integrating local model support (Milestone 3) into the Hey Buddy web application. All code modifications are designed to be read-only and will be implemented by the Implementer agent.

---

## 1. Summary of Requirements

The objective of Milestone 3 is to integrate local model execution capabilities into Hey Buddy. This requires:
1. Copying the master build files (`model-catalog.js`, `device-guard.js`, `local-provider.js`) into `app/js/`.
2. Detecting if the user is running a local OpenAI-compatible server (e.g., Ollama, LM Studio, llama.cpp, Jan) on startup.
3. Adding "Local (Ollama/LM Studio)" to the provider picker if a local server is running.
4. If no local server is detected, showing a "Local (Offline Fallback)" option with a device-guarded selection of curated models.
5. Performing pre-flight checks on storage space and RAM before starting any model download/load, blocking or warning the user accordingly.
6. Enforcing a hard ceiling limit (`MAX_DOWNLOAD_MB`) on downloads.

---

## 2. File Verification & Copying

The three master files to copy from the extraction path are:
- `04_HeyBuddy_v1.0_Build/app/js/model-catalog.js` -> `app/js/model-catalog.js`
- `04_HeyBuddy_v1.0_Build/app/js/device-guard.js` -> `app/js/device-guard.js`
- `04_HeyBuddy_v1.0_Build/app/js/local-provider.js` -> `app/js/local-provider.js`

**Verification:** The files currently in the workspace at `app/js/` have been verified. They are structurally complete and correspond to the master build. To ensure exact alignment, the copying command to be run is:
```bash
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
```

---

## 3. Code Modifications

### A. Modifications to `app/js/providers.js`

1. **Import `localChat`**: Import the streaming chat helper from `local-provider.js`.
2. **Add `local` to `PROVIDERS`**: Register a placeholder `local` entry in the `PROVIDERS` export object. This makes it visible to the app structure, with models to be dynamically filled at startup.
3. **Route `local` in `streamChat`**: Add a case for `local` in `streamChat()` which redirects completion streams to `localChat`.

#### Proposed Diff for `app/js/providers.js`:

```javascript
// Add import at the top of app/js/providers.js:
import { localChat } from './local-provider.js';

// Inside the PROVIDERS export block:
export const PROVIDERS = {
  openai: { ... },
  anthropic: { ... },
  google: { ... },
  openrouter: { ... },
  local: {
    label:       'Local (Ollama/LM Studio)',
    docsUrl:     'https://github.com/ollama/ollama',
    models:      [], // Dynamically populated at runtime
    defaultModel: '',
  }
};

// Inside streamChat(opts):
export async function streamChat({ provider, model, apiKey, system, messages, onChunk, signal }) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal });
    case 'anthropic':
      return _streamAnthropic({ model, apiKey, system, messages, onChunk, signal });
    case 'google':
      return _streamGoogle({ model, apiKey, system, messages, onChunk, signal });
    case 'local':
      return _streamLocal({ model, base: apiKey, system, messages, onChunk, signal });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Add the helper function _streamLocal:
async function _streamLocal({ model, base, system, messages, onChunk, signal }) {
  const localMessages = [
    { role: 'system', content: system },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];
  let full = '';
  await localChat({
    base,
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

---

### B. Modifications to `app/js/app.js`

1. **Import `getModel`**: Import `getModel` from `./model-catalog.js` to enable UI lookup for pre-flight checking.
2. **Dynamic Provider Populating**: Call `resolveLocalOptions()` on startup.
   - If local server is detected (`opts.mode === 'own'`), configure `PROVIDERS.local` with the server's models and add the "Local (Ollama/LM Studio)" option to the provider select.
   - If local server is not detected (`opts.mode === 'fallback'`), obtain the device kind (`detectDeviceKind()`) and load only compatible catalog options (hide `desktop` models on mobile phones). Configure `PROVIDERS.local` with these fallback models and add "Local (Offline Fallback)" to the select.
3. **Form Validation & UI Wiring**:
   - Hide the API key input group when the `local` provider is selected.
   - Keep the passphrase input required, as it protects chat histories in IndexedDB.
4. **Pre-flight Checks**:
   - When the user clicks "Save & Connect" with `local` selected in `fallback` mode, retrieve the model info using `getModel(model)` and execute `preflight(model)`.
   - Block and show the error message in the setup modal if the verdict is `'block'`. Show a warning prompt if the verdict is `'warn'`, letting the user decide to continue.
5. **Download Ceiling Enforcement**:
   - Since `preflight(model)` uses `canDownload(model)` which checks `sizeMb > MAX_DOWNLOAD_MB`, the ceiling is automatically and securely enforced.
6. **Key Encryption Routing**:
   - In `saveApiKey`, if `provider === 'local'`, we store the base URL of the local server (e.g. `state.localOptions.endpoint.base` or the fallback default `http://localhost:11434/v1`) encrypted in the `apiKey` slot. This is later decrypted as `state.apiKeyDecrypted` and passed to `streamChat()` as the `base` parameter.

#### Proposed Diff for `app/js/app.js`:

```javascript
// Add import at the top of app/js/app.js:
import { getModel } from './model-catalog.js';

// Modify localOptions initialization and startup detection inside init():
// Replace lines 241-247 with:
  resolveLocalOptions().then((opts) => {
    state.localOptions = opts;
    
    const select = dom.providerSelect;
    const option = document.createElement('option');
    option.value = 'local';
    
    if (opts.mode === 'own') {
      console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
      option.textContent = 'Local (Ollama/LM Studio)';
      PROVIDERS.local.label = 'Local (Ollama/LM Studio)';
      PROVIDERS.local.models = opts.models.map(m => ({ id: m, label: m }));
      PROVIDERS.local.defaultModel = opts.models[0] || '';
    } else {
      console.log(`[HeyBuddy] No local server detected. Using fallback catalog.`);
      option.textContent = 'Local (Offline Fallback)';
      PROVIDERS.local.label = 'Local (Offline Fallback)';
      const deviceKind = detectDeviceKind();
      const candidates = catalogFor(deviceKind);
      PROVIDERS.local.models = candidates.map(m => ({ id: m.id, label: `${m.name} (${m.sizeMb}MB)` }));
      PROVIDERS.local.defaultModel = candidates[0]?.id || '';
    }
    
    select.appendChild(option);
    
    // Auto-select and re-populate if saved provider was local
    if (state.apiConfig && state.apiConfig.provider === 'local') {
      updateModelOptions('local');
      if (dom.modelSelect) {
        dom.modelSelect.value = state.apiConfig.model;
      }
    }
  }).catch((err) => {
    console.error('[HeyBuddy] Failed to resolve local options:', err);
  });

// Modify saveApiKey function (around line 271):
async function saveApiKey(apiKey, passphrase, provider, model) {
  let keyToEncrypt = apiKey;
  if (provider === 'local') {
    keyToEncrypt = (state.localOptions && state.localOptions.mode === 'own')
      ? state.localOptions.endpoint.base
      : 'http://localhost:11434/v1';
  }
  const blob = await encryptApiKey(keyToEncrypt, passphrase);
  await put('api_keys', { provider: 'primary', ...blob, providerName: provider, model });
  state.apiKeyDecrypted = keyToEncrypt;
  state.apiConfig = { provider, model };
  state.isDemo = false;
  setConnectionStatus('connected', `${PROVIDERS[provider]?.label ?? provider} · ${model}`);
}

// Modify settings button handler in wireEvents() to correctly show/hide fields:
  dom.settingsBtn.addEventListener('click', () => {
    clearError(dom.setupError);
    if (state.apiConfig) {
      dom.providerSelect.value = state.apiConfig.provider;
      updateModelOptions(state.apiConfig.provider);
      dom.modelSelect.value = state.apiConfig.model;
      
      const apiKeyGroup = dom.apiKeyInput.closest('.form-group');
      if (state.apiConfig.provider === 'local') {
        apiKeyGroup.style.display = 'none';
        dom.getKeyLink.style.display = 'none';
        dom.apiKeyInput.value = '';
      } else {
        apiKeyGroup.style.display = '';
        dom.getKeyLink.style.display = '';
        dom.apiKeyInput.value = state.apiKeyDecrypted || '';
      }
    }
    showModal(dom.setupModal);
  });

// Modify providerSelect change event handler (around line 737):
  dom.providerSelect.addEventListener('change', () => {
    const provider = dom.providerSelect.value;
    updateModelOptions(provider);
    
    // Toggle API Key input visibility
    const apiKeyGroup = dom.apiKeyInput.closest('.form-group');
    if (provider === 'local') {
      apiKeyGroup.style.display = 'none';
      dom.getKeyLink.style.display = 'none';
    } else {
      apiKeyGroup.style.display = '';
      dom.getKeyLink.style.display = '';
    }
  });

// Modify setupSaveBtn event handler (around line 750):
  dom.setupSaveBtn.addEventListener('click', async () => {
    clearError(dom.setupError);
    const key        = dom.apiKeyInput.value.trim();
    const passphrase = dom.passphraseInput.value;
    const provider   = dom.providerSelect.value;
    const model      = dom.modelSelect.value;

    if (provider !== 'local') {
      if (!key)        return showError(dom.setupError, 'Please enter your API key.');
    }
    if (!passphrase) return showError(dom.setupError, 'Please choose an encryption passphrase.');
    if (passphrase.length < 8) return showError(dom.setupError, 'Passphrase must be at least 8 characters.');

    // Pre-flight check for fallback local models
    if (provider === 'local' && state.localOptions && state.localOptions.mode === 'fallback') {
      const selectedModel = getModel(model);
      if (selectedModel) {
        const check = await preflight(selectedModel);
        if (check.verdict === 'block') {
          return showError(dom.setupError, check.download.reason || check.load.reason || 'Model blocked.');
        }
        if (check.verdict === 'warn') {
          const proceed = confirm(`${check.download.reason || check.load.reason}\n\nDo you want to proceed anyway?`);
          if (!proceed) return;
        }
      }
    }

    dom.setupSaveBtn.textContent = 'Encrypting...';
    dom.setupSaveBtn.disabled = true;

    try {
      await saveApiKey(key, passphrase, provider, model);
      dom.apiKeyInput.value    = '';
      dom.passphraseInput.value = '';
      hideModal(dom.setupModal);
    } catch (err) {
      showError(dom.setupError, `Error: ${err.message}`);
    } finally {
      dom.setupSaveBtn.textContent = 'Save & Connect';
      dom.setupSaveBtn.disabled = false;
    }
  });
```

---

## 4. Verification Plan

After implementation, verification should be performed as follows:
1. **Local Server Detection (Path A):**
   - Run a local model server (Ollama or LM Studio) on the host machine.
   - Load the app and open settings.
   - Verify that "Local (Ollama/LM Studio)" is added to the provider dropdown.
   - Select it and verify that the models from the local server are correctly loaded into the model selection dropdown.
   - Connect, initiate a chat, and verify that streaming tokens are correctly returned by the local server.
2. **Guarded Fallback (Path B):**
   - Ensure no local model server is running on the host.
   - Load the app and open settings.
   - Verify that "Local (Offline Fallback)" is added to the provider dropdown.
   - Select it. On a desktop browser, verify that all 4 models (including the desktop 3B model) are displayed.
   - Simulate a mobile device (using Chrome DevTools Device Emulator). Verify that only the 3 mobile-safe models are displayed and the 3B desktop model is hidden.
3. **Pre-flight & Ceiling Guard:**
   - Select a fallback model.
   - If mock disk size / memory values can be set (or by testing on a low-memory device), verify that `preflight(model)` blocks or warns if thresholds are breached.
   - Verify that models exceeding `MAX_DOWNLOAD_MB` are never offered (or blocked if manually loaded).
