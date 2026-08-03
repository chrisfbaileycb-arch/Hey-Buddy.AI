# Milestone 3 Analysis: Local Model Support

## Core Objectives
Milestone 3 aims to integrate local model execution capabilities into the Hey Buddy PWA. This is done via two sub-modes:
1. **System Local Server (`own` mode)**: If a user has a running OpenAI-compatible server (e.g. Ollama, LM Studio, llama.cpp, Jan) on their machine, Hey Buddy will auto-detect it on localhost and populate the model dropdown list with the user's own models.
2. **Guarded Offline Catalog (`fallback` mode)**: If no local server is found, the system offers a small curated catalog of device-safe GGUF models. It detects the device memory and storage space before download/load, and limits downloads based on a hard ceiling.

---

## 1. Copying Master Build Files
The following three ES modules must be copied from the master build extraction directory to the local workspace:

* **Source Paths**:
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js`
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js`
  * `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js`
* **Target Directory**:
  * `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/`

* **Proposed Shell Commands**:
  ```bash
  cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/model-catalog.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
  cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/device-guard.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
  cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/local-provider.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/
  ```

---

## 2. Wiring Local Options in `app/js/providers.js`

### Modifications Required:
1. Import `localChat` from `./local-provider.js` at the top.
2. Add a `local` provider object in `PROVIDERS` to hold its label and docs url.
3. Update `streamChat` to accept `localBase` in options and add a case for `local`.
4. Implement a helper function `_streamLocal` to build the system prompt message and invoke `localChat`.

### Code Snippets:

#### Import and Provider Definition
```javascript
// At the top of app/js/providers.js
import { localChat } from './local-provider.js';

// Inside PROVIDERS object
export const PROVIDERS = {
  // ... existing providers ...
  local: {
    label:       'Local',
    docsUrl:     'https://ollama.com/',
    models:      [],
    defaultModel: '',
  },
};
```

#### Stream Chat Update
```javascript
export async function streamChat({ provider, model, apiKey, localBase, system, messages, onChunk, signal }) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return _streamOpenAI({ provider, model, apiKey, system, messages, onChunk, signal });
    case 'anthropic':
      return _streamAnthropic({ model, apiKey, system, messages, onChunk, signal });
    case 'google':
      return _streamGoogle({ model, apiKey, system, messages, onChunk, signal });
    case 'local':
      return _streamLocal({ model, localBase, system, messages, onChunk, signal });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function _streamLocal({ model, localBase, system, messages, onChunk, signal }) {
  const base = localBase || 'http://localhost:11434/v1';
  const localMessages = [
    { role: 'system', content: system },
    ...messages.map(m => ({ role: m.role, content: m.content }))
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

## 3. Wiring Local Options in `app/js/app.js`

### Modifications Required:
1. Import `getModel` from `./model-catalog.js` at the top.
2. In `init()`, after `resolveLocalOptions()` runs:
   - Check if the `"local"` option already exists in the provider list; if so, remove it to avoid duplication.
   - Dynamically create a new `<option>` element.
   - If `opts.mode === 'own'`, set text to `"Local (Ollama/LM Studio)"` (`local.detected === true`).
   - If `opts.mode === 'fallback'`, set text to `"Local (Offline Catalog)"` (`local.detected === false`).
   - Append this element to `providerSelect`.
3. In `updateModelOptions(providerId)`:
   - If `providerId === 'local'`, hide the API key container by selecting `dom.apiKeyInput.closest('.form-group')` and setting `style.display = 'none'`.
   - Populate `dom.modelSelect` with the detected models if `mode === 'own'`, or with `state.localOptions.candidates` if `mode === 'fallback'` (which already hides desktop-only models on mobile since `candidates` uses `catalogFor(kind)`).
   - If `providerId !== 'local'`, restore the API key container display (`style.display = ''`).
4. In the Setup Save button click listener:
   - Bypass the `!key` validation check if `provider === 'local'`.
   - For `provider === 'local'`, use a dummy key string (e.g. `"local-placeholder-key"`) to pass to `saveApiKey`, which ensures the DB AES encryption and passphrase unlock logic remain fully functional.
   - If `provider === 'local'` and `mode === 'fallback'`, find the selected model object via `getModel(model)` and call `await preflight(modelObj)`.
   - If `preflight` returns `ok: false`, block saving and display `verdict.reason` using `showError(dom.setupError, reason)`.
   - If `preflight` returns `verdict: 'warn'`, display a warning toast to the user but allow proceeding.
5. In `sendMessage()`:
   - Pass `state.localOptions?.endpoint?.base` to `streamChat` as `localBase`.
   - Update the `catch (err)` block in `sendMessage()` to display a more specific, helpful message if the provider is `'local'` (e.g. asking the user to check if their local server is running and CORS is enabled).

### Code Snippets:

#### Import Statement
```javascript
// At the top of app/js/app.js
import { getModel } from './model-catalog.js';
```

#### Startup Initialization (`init`)
```javascript
  // Detect local model server in background (Ollama / LM Studio / llama.cpp / Jan)
  resolveLocalOptions().then((opts) => {
    state.localOptions = opts;
    const providerSelect = document.getElementById('providerSelect');
    
    const existingLocal = Array.from(providerSelect.options).find(opt => opt.value === 'local');
    if (existingLocal) {
      providerSelect.removeChild(existingLocal);
    }
    
    const localOption = document.createElement('option');
    localOption.value = 'local';
    
    if (opts.mode === 'own') {
      localOption.textContent = 'Local (Ollama/LM Studio)';
      console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
    } else {
      localOption.textContent = 'Local (Offline Catalog)';
      console.log(`[HeyBuddy] Local server not detected, using guarded catalog.`);
    }
    providerSelect.appendChild(localOption);
  }).catch((err) => {
    console.error('[HeyBuddy] Failed to resolve local options', err);
  });
```

#### Dropdown Model Options & API Key Field Hiding
```javascript
function updateModelOptions(providerId) {
  const apiKeyGroup = dom.apiKeyInput.closest('.form-group');
  
  if (providerId === 'local') {
    if (apiKeyGroup) apiKeyGroup.style.display = 'none';
    if (state.localOptions) {
      if (state.localOptions.mode === 'own') {
        dom.modelSelect.innerHTML = state.localOptions.models
          .map(m => `<option value="${m}">${m}</option>`)
          .join('');
      } else {
        dom.modelSelect.innerHTML = state.localOptions.candidates
          .map(m => `<option value="${m.id}">${m.name} (${m.sizeMb}MB)</option>`)
          .join('');
      }
    } else {
      dom.modelSelect.innerHTML = '<option value="">No local models available</option>';
    }
    dom.getKeyLink.href = 'https://ollama.com/';
    return;
  }
  
  if (apiKeyGroup) apiKeyGroup.style.display = '';
  
  const provider = PROVIDERS[providerId];
  if (!provider) return;

  dom.modelSelect.innerHTML = provider.models
    .map(m => `<option value="${m.id}">${m.label}</option>`)
    .join('');

  // Update the docs link
  dom.getKeyLink.href = provider.docsUrl;
}
```

#### Setup Save Handler with Preflight & Ceiling Validation
```javascript
  // Setup: Save
  dom.setupSaveBtn.addEventListener('click', async () => {
    clearError(dom.setupError);
    const key        = dom.apiKeyInput.value.trim();
    const passphrase = dom.passphraseInput.value;
    const provider   = dom.providerSelect.value;
    const model      = dom.modelSelect.value;

    const isLocal = provider === 'local';
    if (!isLocal && !key)        return showError(dom.setupError, 'Please enter your API key.');
    if (!passphrase) return showError(dom.setupError, 'Please choose an encryption passphrase.');
    if (passphrase.length < 8) return showError(dom.setupError, 'Passphrase must be at least 8 characters.');

    // Preflight check for local offline catalog models
    if (isLocal && state.localOptions && state.localOptions.mode === 'fallback') {
      const modelObj = getModel(model);
      if (modelObj) {
        const check = await preflight(modelObj);
        if (!check.ok) {
          const errorReason = (check.download && !check.download.ok) ? check.download.reason : (check.load && !check.load.ok) ? check.load.reason : 'Device preflight check failed.';
          showError(dom.setupError, errorReason);
          return;
        }
        if (check.verdict === 'warn') {
          const warnReason = (check.download && check.download.level === 'warn') ? check.download.reason : (check.load && check.load.level === 'warn') ? check.load.reason : 'Warning: Performance or space may be tight.';
          showToast(warnReason);
        }
      }
    }

    dom.setupSaveBtn.textContent = 'Encrypting...';
    dom.setupSaveBtn.disabled = true;

    try {
      // Use a dummy key placeholder to preserve IndexedDB API key encryption & unlock logic
      const keyToSave = isLocal ? 'local-placeholder-key' : key;
      await saveApiKey(keyToSave, passphrase, provider, model);
      // Clear fields immediately — key should not stay in DOM
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

#### Stream Chat Call and Specific Catch Error Handler
```javascript
      response = await streamChat({
        provider: state.apiConfig.provider,
        model:    state.apiConfig.model,
        apiKey:   state.apiKeyDecrypted,
        localBase: state.localOptions?.endpoint?.base, // Add localBase parameter
        system:   systemPrompt,
        messages: state.messages,
        signal:   state.abortController.signal,
        onChunk:  (chunk) => {
          typingEl.textContent = (typingEl.textContent || '') + chunk;
          scrollToBottom();
        },
      });
```
```javascript
  } catch (err) {
    typingEl.remove();
    if (err.name === 'AbortError') {
      appendMessage('buddy', '*(response stopped)*');
    } else if (state.apiConfig.provider === 'local') {
      appendMessage('buddy', `⚠️ ${err.message}\n\nMake sure your local server (Ollama/LM Studio) is running and CORS is enabled.`);
    } else {
      appendMessage('buddy', `⚠️ ${err.message}\n\nCheck your API key in Settings, or switch to Demo mode.`);
    }
  }
```

---

## 4. Verification and Safety Gate Compatibility
1. **Localhost Endpoint Compliance**: The security gate script (`scripts/nexus-gate.mjs`) allows outbound connections to `localhost` and `127.0.0.1` by default. Connecting to Ollama (port 11434), LM Studio (port 1234), llama.cpp (port 8080), or Jan (port 1337) is fully compliant and will not trigger network-call check failures.
2. **Device Guard Checks**:
   - `catalogFor('phone')` filters out the Llama 3.2 3B desktop model automatically. Mobile user agents will not be presented with this model option.
   - `canDownload()` blocks anything exceeding `MAX_DOWNLOAD_MB` (currently 2020 MB in `model-catalog.js`). This ceiling is checked via `preflight(model)`.
