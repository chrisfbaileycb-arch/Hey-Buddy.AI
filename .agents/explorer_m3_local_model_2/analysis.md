# Analysis & Implementation Plan - Local Model Support (Milestone 3)

## Summary of Findings
We have investigated the requirements for integrating local model execution capabilities into the Hey Buddy PWA shell.
1. The three master build source files (`model-catalog.js`, `device-guard.js`, `local-provider.js`) exist in the workspace and match the ones in `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/` exactly.
2. The local model options need to be wired into `app/js/providers.js` and `app/js/app.js` to enable "Local (Ollama/LM Studio)" as a first-class provider.
3. If no local server is detected, the app must display the guarded model options from the catalog (`phone-safe` and `phone-ok` for phones, and all for desktops), hiding `desktop` models on mobile devices.
4. Preflight checks (`device-guard.js` -> `preflight`) and size checks (`MAX_DOWNLOAD_MB` limit) must run:
   - On Setup save to prevent choosing an incompatible model.
   - On message send to block execution and warn users with a friendly, clean UI.
5. Setup logic must be updated to skip API key/passphrase checks and unlock screens when the local provider is active, since it runs locally and keylessly.

---

## File Copying Plan
Although the files are already co-located in the workspace, the formal instruction to verify and/or copy the master files to `app/js/` is:
```bash
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
```

---

## Proposed Code Modifications

### 1. `app/js/providers.js`

Add `local` to the `PROVIDERS` object and wire `localChat` inside `streamChat`.

#### Import Section
Add at the top of the file:
```javascript
import { localChat } from './local-provider.js';
```

#### `PROVIDERS` Map Integration
Add the `local` configuration stub:
```javascript
export const PROVIDERS = {
  openai: {
    // ... existing
  },
  // ... other providers
  local: {
    label:       'Local (Ollama/LM Studio)',
    docsUrl:     'https://ollama.com',
    models:      [], // Dynamically populated
    defaultModel: '',
  }
};
```

#### `streamChat` Function
```javascript
export async function streamChat({ provider, model, apiKey, system, messages, onChunk, signal, localOptions }) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal });
    case 'anthropic':
      return _streamAnthropic({ model, apiKey, system, messages, onChunk, signal });
    case 'google':
      return _streamGoogle({ model, apiKey, system, messages, onChunk, signal });
    case 'local': {
      let base = 'http://localhost:11434/v1'; // Default Ollama base fallback
      if (localOptions && localOptions.mode === 'own' && localOptions.endpoint) {
        base = localOptions.endpoint.base;
      }
      return localChat({ base, model, messages, onToken: onChunk, signal });
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

---

### 2. `app/js/app.js`

#### Imports
Import `getModel` and `MAX_DOWNLOAD_MB` from `./model-catalog.js`.
```javascript
import { detectDeviceKind, preflight }
  from './device-guard.js';
import { getModel, MAX_DOWNLOAD_MB }
  from './model-catalog.js';
```

#### Dynamic Dropdown & Model Update in `init()`
Locate:
```javascript
  // Detect local model server in background (Ollama / LM Studio / llama.cpp / Jan)
  resolveLocalOptions().then((opts) => {
    state.localOptions = opts;
    if (opts.mode === 'own') {
      console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
      // Could add 'local' to provider picker here in a future pass
    }
  }).catch(() => {});
```
Replace with:
```javascript
  // Detect local model server in background (Ollama / LM Studio / llama.cpp / Jan)
  resolveLocalOptions().then((opts) => {
    state.localOptions = opts;
    
    // Add "Local (Ollama/LM Studio)" to the provider picker option list
    const localOpt = document.createElement('option');
    localOpt.value = 'local';
    localOpt.textContent = 'Local (Ollama/LM Studio)';
    dom.providerSelect.appendChild(localOpt);

    if (opts.mode === 'own') {
      console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
      PROVIDERS.local.models = opts.models.map(m => ({ id: m, label: `${m} (Running via ${opts.endpoint.name})` }));
      PROVIDERS.local.defaultModel = opts.models[0];
    } else {
      console.log('[HeyBuddy] No local server detected. Using guarded catalog.');
      PROVIDERS.local.models = opts.candidates.map(m => ({ id: m.id, label: `${m.name} (${m.sizeMb} MB)` }));
      PROVIDERS.local.defaultModel = opts.candidates[0]?.id;
    }

    if (state.apiConfig && state.apiConfig.provider === 'local') {
      updateModelOptions('local');
      dom.modelSelect.value = state.apiConfig.model;
    }
  }).catch((err) => {
    console.error('[HeyBuddy] Error resolving local options:', err);
  });
```

#### Skip Passphrase Unlock on Startup in `loadApiConfig()`
Locate:
```javascript
async function loadApiConfig() {
  const stored = await get('api_keys', 'primary');
  if (!stored) {
    // First run — show setup
    showModal(dom.setupModal);
    return;
  }

  // Key exists encrypted — show unlock
  state.apiConfig = { provider: stored.provider, model: stored.model };
  showModal(dom.unlockModal);
}
```
Replace with:
```javascript
async function loadApiConfig() {
  const stored = await get('api_keys', 'primary');
  if (!stored) {
    // First run — show setup
    showModal(dom.setupModal);
    return;
  }

  state.apiConfig = { provider: stored.providerName, model: stored.model };

  if (stored.providerName === 'local') {
    // Local runs keyless, bypass passphrase unlock modal
    state.apiKeyDecrypted = '';
    state.isDemo = false;
    setConnectionStatus('connected', `Local · ${stored.model}`);
  } else {
    showModal(dom.unlockModal);
  }
}
```

#### Skip Encryption on Key Save in `saveApiKey()`
Locate:
```javascript
async function saveApiKey(apiKey, passphrase, provider, model) {
  const blob = await encryptApiKey(apiKey, passphrase);
  await put('api_keys', { provider: 'primary', ...blob, providerName: provider, model });
  state.apiKeyDecrypted = apiKey;
  state.apiConfig = { provider, model };
  state.isDemo = false;
  setConnectionStatus('connected', `${PROVIDERS[provider]?.label ?? provider} · ${model}`);
}
```
Replace with:
```javascript
async function saveApiKey(apiKey, passphrase, provider, model) {
  if (provider === 'local') {
    await put('api_keys', {
      provider: 'primary',
      providerName: provider,
      model,
      encryptedKey: '',
      salt: '',
      iv: ''
    });
    state.apiKeyDecrypted = '';
    state.apiConfig = { provider, model };
    state.isDemo = false;
    setConnectionStatus('connected', `Local · ${model}`);
  } else {
    const blob = await encryptApiKey(apiKey, passphrase);
    await put('api_keys', { provider: 'primary', ...blob, providerName: provider, model });
    state.apiKeyDecrypted = apiKey;
    state.apiConfig = { provider, model };
    state.isDemo = false;
    setConnectionStatus('connected', `${PROVIDERS[provider]?.label ?? provider} · ${model}`);
  }
}
```

#### Toggle Key Visibility and Skip Validation in `wireEvents()`
Locate:
```javascript
  // Setup modal: provider change → update models
  dom.providerSelect.addEventListener('change', () => {
    updateModelOptions(dom.providerSelect.value);
  });
  updateModelOptions('openai'); // init
```
Replace with:
```javascript
  // Setup modal: provider change → update models
  dom.providerSelect.addEventListener('change', () => {
    const provider = dom.providerSelect.value;
    updateModelOptions(provider);
    
    // Hide key & passphrase input fields if local is selected
    const isLocal = provider === 'local';
    dom.apiKeyInput.closest('.form-group').style.display = isLocal ? 'none' : '';
    dom.passphraseInput.closest('.form-group').style.display = isLocal ? 'none' : '';
  });
  updateModelOptions('openai'); // init
```

#### Preflight & Limit Check in Setup Save Action
Locate the validation rules inside `dom.setupSaveBtn.addEventListener('click', ...)`:
```javascript
    if (!key)        return showError(dom.setupError, 'Please enter your API key.');
    if (!passphrase) return showError(dom.setupError, 'Please choose an encryption passphrase.');
    if (passphrase.length < 8) return showError(dom.setupError, 'Passphrase must be at least 8 characters.');
```
Replace with:
```javascript
    if (provider !== 'local') {
      if (!key)        return showError(dom.setupError, 'Please enter your API key.');
      if (!passphrase) return showError(dom.setupError, 'Please choose an encryption passphrase.');
      if (passphrase.length < 8) return showError(dom.setupError, 'Passphrase must be at least 8 characters.');
    } else {
      // Local fallback preflight validation
      if (state.localOptions && state.localOptions.mode === 'fallback') {
        const modelObj = getModel(model);
        if (modelObj) {
          if (modelObj.sizeMb > MAX_DOWNLOAD_MB) {
            return showError(dom.setupError, `This model exceeds the maximum download limit of ${MAX_DOWNLOAD_MB} MB.`);
          }
          const check = await preflight(modelObj);
          if (!check.ok) {
            const reason = check.download.reason || check.load.reason;
            return showError(dom.setupError, `Device Check Failed: ${reason}`);
          }
        }
      }
    }
```

#### Preflight & Limit Check at Message Send in `sendMessage()`
Locate:
```javascript
      response = await streamChat({
        provider: state.apiConfig.provider,
        model:    state.apiConfig.model,
        apiKey:   state.apiKeyDecrypted,
        system:   systemPrompt,
        messages: state.messages,
        signal:   state.abortController.signal,
        onChunk:  (chunk) => {
          typingEl.textContent = (typingEl.textContent || '') + chunk;
          scrollToBottom();
        },
      });
```
Replace with:
```javascript
      if (state.apiConfig.provider === 'local' && state.localOptions.mode === 'fallback') {
        const modelObj = getModel(state.apiConfig.model);
        if (modelObj) {
          if (modelObj.sizeMb > MAX_DOWNLOAD_MB) {
            typingEl.remove();
            appendMessage('buddy', `⚠️ Blocked: This model size (${modelObj.sizeMb} MB) exceeds the hard download ceiling limit of ${MAX_DOWNLOAD_MB} MB.`);
            state.isStreaming = false;
            dom.sendBtn.disabled = !dom.messageInput.value.trim();
            return;
          }
          const check = await preflight(modelObj);
          if (!check.ok) {
            typingEl.remove();
            const reason = check.download.reason || check.load.reason;
            appendMessage('buddy', `⚠️ Device Compatibility Check Failed:\n\n${reason}`);
            state.isStreaming = false;
            dom.sendBtn.disabled = !dom.messageInput.value.trim();
            return;
          } else if (check.verdict === 'warn') {
            const reason = check.download.reason || check.load.reason;
            showToast(reason);
          }
        }
      }

      response = await streamChat({
        provider: state.apiConfig.provider,
        model:    state.apiConfig.model,
        apiKey:   state.apiKeyDecrypted,
        system:   systemPrompt,
        messages: state.messages,
        signal:   state.abortController.signal,
        onChunk:  (chunk) => {
          typingEl.textContent = (typingEl.textContent || '') + chunk;
          scrollToBottom();
        },
        localOptions: state.localOptions
      });
```
