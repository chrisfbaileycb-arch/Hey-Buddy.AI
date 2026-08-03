# PWA Integration Analysis and Implementation Plan (Milestone 1)

## Summary of Findings
Integrating PWA capabilities into Hey Buddy requires copying the manifest, service worker, icons, and install helper from the master build, updating `app/index.html` with PWA meta tags, and wiring the registration and install UX in `app/js/app.js`.

---

## 1. File Copy Plan

The following files must be copied from the master build directory to the workspace.

### File Mappings
| File Description | Source Path (in Master Build) | Destination Path (in Workspace) |
|---|---|---|
| **Web App Manifest** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/manifest.json` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json` |
| **Service Worker** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/service-worker.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js` |
| **PWA Install Helper** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/pwa-install.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js` |
| **Icon Directory** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/icons/` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/` |

### Copy Commands (for the Worker)
```bash
# Copy single files
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/manifest.json /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/service-worker.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/pwa-install.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js

# Copy icon directory (create if it does not exist)
mkdir -p /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons
cp -r /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/icons/. /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/
```

---

## 2. App Shell (`app/index.html`) Requirements

### Head Meta Tags
The workspace `app/index.html` currently contains relative PWA head tags, which resolve correctly under local subdirectory serving. However, to match the master build specification, root-relative paths can be used if the server is configured to serve the `app/` folder as the root.

Here is the recommended head tag configuration:
```html
  <!-- PWA -->
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#0f1220" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" href="/icons/favicon-32.png" sizes="32x32" />
  <!-- iOS full-screen when launched from home screen -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Hey Buddy" />
```

### Install Button placement
The install button (`#installBtn`) is **already present** in `app/index.html` under the `chat-header-actions` div. No HTML changes are required to add the button.
```html
<button class="header-action-btn install-btn" id="installBtn"
        aria-label="Add Hey Buddy to home screen" hidden title="Install app">📲</button>
```

---

## 3. App Logic (`app/js/app.js`) Wiring

To integrate the PWA install flow and service worker registration, `app/js/app.js` must be updated as follows:

### Step 3a: Add Imports
Import the PWA functions at the top of the file:
```javascript
import { registerServiceWorker, setupInstall, promptInstall, IOS_INSTALL_HINT } from './pwa-install.js';
```

### Step 3b: Add DOM Reference
Add the `installBtn` reference in the `dom` config:
```javascript
const dom = {
  // ... existing elements ...
  clearBtn:          $('clearBtn'),
  installBtn:        $('installBtn'), // Add this line
};
```

### Step 3c: Add Toast Notification Utility
Add a clean, self-contained toast function at the end of the file for displaying iOS installation hints and success messages:
```javascript
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 18, 32, 0.95);
    color: #fff;
    padding: 0.75rem 1.5rem;
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.85rem;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
```

### Step 3d: Wire Startup Registration in `init()`
Call `registerServiceWorker` and `setupInstall` inside `init()`:
```javascript
async function init() {
  await openDB();
  await loadApiConfig();
  wireEvents();
  setActivePersona('drill');

  // Register PWA service worker and setup install prompt
  registerServiceWorker();
  setupInstall({
    button: dom.installBtn,
    onAvailable: (kind) => {
      if (kind === 'ios') {
        showToast(IOS_INSTALL_HINT);
      }
    },
    onInstalled: () => {
      showToast('Hey Buddy added to your home screen ❤️');
    }
  });

  // Oracle timer
  updateOracleTimer();
  setInterval(updateOracleTimer, 60_000);

  // Fake player count
  dom.oraclePlayerCount.textContent = `👥 ${Math.floor(Math.random() * 200 + 50)} players today`;
}
```

### Step 3e: Add Click Listener in `wireEvents()`
Add the event handler for the install button in `wireEvents()`:
```javascript
  // PWA Install Button Click handler
  dom.installBtn.addEventListener('click', async () => {
    const outcome = await promptInstall();
    console.log('[HeyBuddy] Install prompt outcome:', outcome);
  });
```

---

## 4. Security and Cache Control (How Service Worker avoids Caching Secrets)

The copied `service-worker.js` avoids caching sensitive data (API keys, model files, provider responses) through several built-in guardrails:

1. **HTTP Method Filter**:
   ```javascript
   if (req.method !== 'GET') return;
   ```
   All API requests (e.g. streaming LLM completions, TTS audio generations, model file fetches that use POST/PUT) bypass the service worker entirely.
2. **Explicit Domain Allowlist/Blocklist**:
   ```javascript
   const NEVER_CACHE_HOSTS = [
     'api.openai.com',
     'api.anthropic.com',
     'openrouter.ai',
     'generativelanguage.googleapis.com',
     'api.elevenlabs.io',
     'huggingface.co',
     'cdn-lfs.huggingface.co',
   ];
   ```
   The worker checks the request's hostname. If it matches or is a subdomain of any entry in this array, the worker returns early and lets the browser handle it via the live network:
   ```javascript
   if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
     return;
   }
   ```
3. **Same-Origin Constraint**:
   ```javascript
   if (url.origin === self.location.origin) { ... }
   ```
   Only assets originating from the application's own origin are cached, preventing any third-party credentials or API responses from ever being written to the cache.
4. **Basic Response Filtering**:
   Only successful static responses (`res.status === 200` and `res.type === 'basic'`) are cached, preventing error pages, opaque redirects, or cross-origin data from corrupting the cache.

---

## 5. Build, Formatting, and Linting Tools

The project contains no automated JS formatter configurations (like ESLint or Prettier config files). The primary build verification tool is:

- **Nexus Security Gate (`scripts/nexus-gate.mjs`)**:
  - Run as a Git pre-commit hook via `install-hook.sh`.
  - Scans staged changes for hardcoded secrets, lint-weakening rules, and unauthorized outbound network calls.
  - The security gate allowlist (`nexus-gate.config.json`) already permits the necessary external endpoints (`api.elevenlabs.io`, `cdn-lfs.huggingface.co`, and Google Fonts hosts).

### Worker Formatting Instruction
The Worker must ensure that code modifications in `app/js/app.js` and `app/index.html` use 2-space indentation, include appropriate descriptive comments, and do not introduce hardcoded credentials or disable rules, in order to pass the Nexus Security Gate checks.

---

## 6. Worker Execution Plan (Step-by-Step Instructions)

1. **Copy Files**: Execute the `cp` commands in Section 1 to copy the manifest, service-worker, icons, and install helper.
2. **Modify HTML**: Update `app/index.html` head tags to match the root-relative configuration in Section 2.
3. **Modify JS**: Update `app/js/app.js` as detailed in Section 3:
   - Add imports.
   - Register `installBtn` in `dom` references.
   - Insert the `showToast` utility function.
   - Call registration/setup in `init()`.
   - Attach click listener to `installBtn` in `wireEvents()`.
4. **Test Locally**:
   - Run a local static server targeting the `app/` directory as root:
     ```bash
     npx http-server app
     ```
   - Open the app in Chrome/Edge, open DevTools -> Application, and verify that the manifest loads correctly and the service worker is active.
5. **Run Security Audit**:
   - Run the Nexus Security Gate scanner to verify the project has no blocking issues:
     ```bash
     node scripts/nexus-gate.mjs --all
     ```
