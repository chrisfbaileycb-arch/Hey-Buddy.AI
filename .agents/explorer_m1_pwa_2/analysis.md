# Milestone 1: PWA Integration Analysis and Implementation Plan

This document contains the requirements analysis and a detailed, step-by-step implementation plan for **Milestone 1: PWA (R1)** of the Hey Buddy integration.

---

## 1. File Copy Operations (Source & Destination Paths)

To integrate PWA capabilities, the following files must be copied from the master build extraction to the workspace.

| Source Path (Master Build) | Destination Path (Workspace) | Status/Action |
|:---|:---|:---|
| `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/manifest.json` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json` | **Overwrite**: Replace the existing workspace file to ensure latest version is present. |
| `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/service-worker.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js` | **Overwrite**: Replace the existing workspace file to ensure latest version is present. |
| `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/pwa-install.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js` | **Create**: Copy this helper script to wire up install events. |
| `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/icons/` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/` | **Create Directory & Copy**: Copy the entire directory and all contained icon files: <br>- `apple-touch-icon.png`<br>- `favicon-32.png`<br>- `icon-72.png`, `icon-96.png`, `icon-128.png`, `icon-144.png`, `icon-152.png`, `icon-192.png`, `icon-256.png`, `icon-384.png`, `icon-512.png`<br>- `maskable-192.png`, `maskable-512.png` |

### ⚠️ Subdirectory Scope Adjustments (Critical Observation)
The master build files assume that the `app` folder is deployed as the root domain (e.g. `/service-worker.js`). However, in the workspace, the landing page is at `/index.html` and the actual PWA is nested in the `/app/` subdirectory.

To prevent PWA installation failures and offline caching bugs, the files must be adjusted:

1. **`app/manifest.json` adjustments**:
   - Change `"id": "/"` to `"id": "/app/"`
   - Change `"start_url": "/?source=pwa"` to `"start_url": "/app/index.html?source=pwa"`
   - Change `"scope": "/"` to `"scope": "/app/"`
   - Keeps icon paths relative (`icons/...`), which correctly resolves to `/app/icons/...`.

2. **`app/service-worker.js` adjustments**:
   - Adjust `SHELL_ASSETS` to reference the `/app/` sub-scope assets and include all critical ES modules required on startup:
     ```javascript
     const SHELL_ASSETS = [
       '/app/',
       '/app/index.html',
       '/app/css/app.css',
       '/app/css/sandbox-notice.css',
       '/app/js/app.js',
       '/app/js/pwa-install.js',
       '/app/js/providers.js',
       '/app/manifest.json',
       '/app/icons/icon-192.png',
       '/app/icons/icon-512.png',
       '/security/storage.js',
       '/security/crypto.js',
       '/security/guardrails.js'
     ];
     ```
   - Update push notification asset path references inside `push` listener:
     - `icon: '/icons/icon-192.png'` ➔ `icon: '/app/icons/icon-192.png'`
     - `badge: '/icons/icon-96.png'` ➔ `badge: '/app/icons/icon-96.png'`
     - `data: { url: data.url || '/' }` ➔ `data: { url: data.url || '/app/' }`
   - Update `notificationclick` listener fallback:
     - `const target = (event.notification.data && event.notification.data.url) || '/';` ➔ `const target = (event.notification.data && event.notification.data.url) || '/app/';`

---

## 2. Head Meta Tags in `app/index.html`

The PWA requires specific metadata tags inside the `<head>` of `/app/index.html` to enable the "Add to Home Screen" prompt, set standalone modes, and brand the app shell.

### Required Tags
```html
  <!-- PWA -->
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#0f1220" />
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
  <link rel="icon" href="icons/favicon-32.png" sizes="32x32" />
  <!-- iOS full-screen when launched from home screen -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Hey Buddy" />
```

### Analysis & Status
All of these required head meta tags **already exist** in `/app/index.html` (lines 15-22). They use relative URLs (e.g. `manifest.json` and `icons/...`), which matches the subdirectory structure. **No modifications are required in `app/index.html` for head meta tags.**

---

## 3. Install Button (`#installBtn`) in `app/index.html`

The custom install trigger `#installBtn` is shown to Android/Chromium users when the web app is installable.

### Location & Markup
The `#installBtn` **already exists** in `/app/index.html` at lines 158-159:
```html
          <!-- PWA install button (shown by pwa-install.js when available) -->
          <button class="header-action-btn install-btn" id="installBtn"
                  aria-label="Add Hey Buddy to home screen" hidden title="Install app">📲</button>
```

- **Location**: Inside `<div class="chat-header-actions">` within the main `<header class="chat-header" id="chatHeader">` block.
- **Initial State**: Hidden (`hidden` attribute) by default. The JS wiring will remove this attribute when the installation prompt becomes available on compatible platforms.
- **Styling**: It inherits styles from the `.header-action-btn` class in `app/css/app.css` (lines 399-410), which matches the existing settings button.

No HTML modifications are needed for the install button.

---

## 4. Import & Wiring in `app/js/app.js`

To make the PWA functional, we must wire the lifecycle registration and install triggers in the core app.

### Step-by-Step Code Modifications

#### 1. Import `pwa-install.js` Exports
In `app/js/app.js`, add the import line below the existing imports:
```javascript
import { registerServiceWorker, setupInstall, promptInstall, IOS_INSTALL_HINT }
  from './pwa-install.js';
```

#### 2. Declare `installBtn` in the `dom` Object
Locate `const dom = { ... }` in `app/js/app.js` and add the `installBtn` property:
```javascript
  installBtn:        $('installBtn'),
```

#### 3. Call Registration and setupInstall during `init()`
Inside `async function init()` in `app/js/app.js`, register the service worker and configure the install actions:
```javascript
async function init() {
  await openDB();
  await loadApiConfig();
  wireEvents();
  setActivePersona('drill');

  // Register PWA Service Worker (explicit sub-scope path)
  registerServiceWorker();

  // Setup the PWA install button and events
  setupInstall({
    button: dom.installBtn,
    onAvailable: (kind) => {
      if (kind === 'ios') {
        showToast(IOS_INSTALL_HINT);
      } else if (kind === 'android') {
        dom.installBtn.hidden = false;
      }
    },
    onInstalled: () => showToast('Hey Buddy added to your home screen ❤️'),
  });

  // Oracle timer
  updateOracleTimer();
  setInterval(updateOracleTimer, 60_000);

  // Fake player count
  dom.oraclePlayerCount.textContent = `👥 ${Math.floor(Math.random() * 200 + 50)} players today`;
}
```

*Note: In `registerServiceWorker()`, the path must register `/app/service-worker.js` rather than `/service-worker.js` to match the workspace layout. See Section 1.*

#### 4. Wire Click Handler in `wireEvents()`
In `function wireEvents()`, add the click handler to trigger the install prompt:
```javascript
  // PWA Install click
  dom.installBtn.addEventListener('click', async () => {
    const outcome = await promptInstall();
    console.log('[HeyBuddy] Install prompt outcome:', outcome);
  });
```

#### 5. Implement `showToast` Helper
Since the app doesn't have an existing toast system, implement a self-contained toast utility inside `app/js/app.js`:
```javascript
function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: rgba(15, 18, 32, 0.95);
    color: #ffffff;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.1);
    opacity: 0;
    transform: translateY(1rem);
    transition: opacity 0.3s ease, transform 0.3s ease;
    text-align: center;
    max-width: 90vw;
    pointer-events: auto;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(1rem)';
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}
```

---

## 5. Cache Avoidance and Security Protections

The Hey Buddy service worker employs four layers of security to prevent sensitive user credentials, API keys, local models, or LLM conversations from being cached:

1. **Request Method Restriction**: The `fetch` interceptor explicitly skips any non-`GET` requests:
   ```javascript
   if (req.method !== 'GET') return;
   ```
   This ensures that all conversation requests, authentication posts, and API configuration payloads (typically `POST` or `PUT`) bypass the cache.

2. **Hostname Bypass (Allowlist)**: Outbound requests to model providers, storage layers, and voice synthesis endpoints are explicitly blocked from the cache via `NEVER_CACHE_HOSTS`:
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
   If a request's hostname matches or ends with any of these hosts, the event handler returns immediately without cache checking or caching. This prevents storage of OpenAI keys, Gemini responses, ElevenLabs voice streams, or multi-gigabyte GGUF model files.

3. **Same-Origin Filter**: The service worker only caches requests belonging to the app's own origin (`url.origin === self.location.origin`). This eliminates any potential leak of cross-origin API credentials or payloads.

4. **Basic Response Filtering**: Only standard assets with HTTP status `200` and response type `basic` (same-origin, non-error, non-redirect) are eligible for cache updates.

5. **Storage Isolation**: User API keys are stored in IndexedDB (utilizing `security/storage.js` and `security/crypto.js` AES-256-GCM encryption), which does not trigger service worker network fetch events and is never read or cached by the worker.

---

## 6. Build, Verification, and Formatting Tools

There are no standard Node-based compilation tools (such as Vite, Webpack, Babel) or lint configurations (Prettier, ESLint) initialized in the workspace root. 

Instead, the project uses the **Nexus Security Gate** to format and validate code rules prior to release.

### Actionable Commands for the Worker:
1. **Pre-commit Gating**: Run the security gate over the entire codebase to verify that changes are valid, do not expose secrets, do not create illegal network links, and do not weaken policies:
   ```bash
   node scripts/nexus-gate.mjs --all
   ```
2. **Review Output**: Ensure the gate prints a clean result. Any critical or high severity finding will block commits.
3. **Commit Verification**: The pre-commit hook is managed via `install-hook.sh`. Committing files via Git (`git commit`) will automatically invoke the gate checks on staged files.
