# Milestone 1: PWA (R1) Integration Analysis & Implementation Plan

## 1. Executive Summary
This document provides a detailed analysis of the requirements for integrating Milestone 1: PWA (R1) into Hey Buddy, along with a step-by-step implementation plan for the Implementer. 

During our read-only exploration of the workspace and the master build directory, we identified several critical **path mismatches** between the master PWA files and the project structure. These mismatches, if left unaddressed, would cause PWA registration to fail, cache the wrong files (landing page instead of app shell), and break offline capabilities. This plan provides the exact modifications required to resolve these mismatches.

---

## 2. File Copy Strategy
The following files must be copied from the master build directory to the workspace.

### File Mapping Table
| Resource | Source Path | Target Workspace Path | Action |
|---|---|---|---|
| **PWA Manifest** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/manifest.json` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json` | Copy & Overwrite |
| **Service Worker** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/service-worker.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js` | Copy & Overwrite (requires adjustments) |
| **PWA Install Helper** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/pwa-install.js` | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js` | Copy & Overwrite (requires adjustments) |
| **Full Icon Set** | `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/icons/` (directory) | `/home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/` | Copy whole folder |

### Copy Commands for the Worker
```bash
# 1. Copy manifest.json
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/manifest.json /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json

# 2. Copy service-worker.js
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/service-worker.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js

# 3. Copy pwa-install.js
cp /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/pwa-install.js /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js

# 4. Copy icons folder (create target folder first)
mkdir -p /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/
cp -r /home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/icons/* /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/icons/
```

---

## 3. Discrepancy & Path Mismatch Analysis
The master build files assume that the `app` directory is the web root. However, the project layout uses the workspace root as the web root (so that relative imports like `../../security/storage.js` work correctly in `app/js/app.js`). This discrepancy creates three critical issues:

### 1. Service Worker Registration Failure
- **Issue**: `pwa-install.js` tries to register `/service-worker.js`. Since the file is actually at `/app/service-worker.js`, the browser will fail to register it (404 error).
- **Resolution**: Change the registration path to `/app/service-worker.js` or `./service-worker.js`.

### 2. Cache-Shell Asset Paths Mismatch
- **Issue**: `service-worker.js` attempts to cache absolute paths like `/index.html`, `/css/app.css`, `/js/app.js`. These point to the web root, which does not contain the app shell assets (e.g. `/css/app.css` does not exist; it is at `/app/css/app.css`). This causes the service worker to fail to cache the shell, breaking offline capabilities. Furthermore, caching `/index.html` will mistakenly cache the landing page instead of the app shell.
- **Resolution**: Convert `SHELL_ASSETS` to be relative paths (e.g. `./index.html`, `./css/app.css`). This resolves relative to the service worker's home folder (`/app/`).

### 3. PWA Scope and Launch URL Mismatch
- **Issue**: `manifest.json` defines `"scope": "/"` and `"start_url": "/?source=pwa"`. If the user installs the PWA, it will launch the landing page (`/`), which is a marketing page, not the actual application (`/app/index.html`).
- **Resolution**: Restrict manifest scope and start URL to the `/app/` subdirectory.

---

## 4. Proposed File Modifications

### A. `app/manifest.json`
To ensure the PWA launches into the main app instead of the landing page:
```json
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/manifest.json
// Replace lines 5-7:
  "id": "/app/",
  "start_url": "/app/?source=pwa",
  "scope": "/app/",
```

### B. `app/service-worker.js`
To ensure shell caching works relative to the `/app/` directory and prevent caching of any same-origin API routes:
```javascript
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/service-worker.js

// 1. Update SHELL_ASSETS (lines 16-25) to use relative paths:
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './css/sandbox-notice.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 2. Prevent caching same-origin API endpoints and large model files.
// Modify the fetch listener (around lines 57-88):
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let everything else (POST to APIs, etc.) pass straight through.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Avoid caching same-origin /api/ routes
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) {
    return;
  }

  // Avoid caching large model files or binaries if hosted on same-origin
  const isLargeFile = url.pathname.endsWith('.gguf') || url.pathname.endsWith('.bin') || url.pathname.endsWith('.wasm');
  if (isLargeFile) {
    return;
  }

  // Never touch API / model / auth traffic — always network.
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return; // default browser fetch, no caching
  }

  // Same-origin static assets: cache-first, fall back to network, then cache the result.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            // Only cache good, basic responses.
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match('./index.html')); // Fix: offline fallback to app shell
      })
    );
  }
});
```

### C. `app/js/pwa-install.js`
To register the service worker from the correct subdirectory:
```javascript
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/pwa-install.js
// Replace lines 21-23:
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/app/service-worker.js') // Updated path to locate the file in /app/
        .catch((err) => console.warn('[HeyBuddy] SW registration failed:', err));
    });
```

---

## 5. Wiring in `app/js/app.js` and `app/index.html`

### A. Head Meta Tags in `app/index.html`
The required tags are already present in `app/index.html` (lines 15-22). They use relative URLs, which are correct because the files are located in `/app/`. No modifications are needed.
```html
  <!-- PWA -->
  <link rel="manifest" href="manifest.json" />
  <meta name="theme-color" content="#0f1220" />
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
  <link rel="icon" href="icons/favicon-32.png" sizes="32x32" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Hey Buddy" />
```

### B. `#installBtn` in `app/index.html`
The button element `#installBtn` is already placed in `app/index.html` (lines 158-159) within the `<header class="chat-header">` actions:
```html
          <!-- PWA install button (shown by pwa-install.js when available) -->
          <button class="header-action-btn install-btn" id="installBtn"
                  aria-label="Add Hey Buddy to home screen" hidden title="Install app">📲</button>
```
It is hidden by default (`hidden` attribute) and will be revealed by JavaScript when install is available. No modifications are needed in the HTML.

### C. Import & Wiring in `app/js/app.js`
Modify `app/js/app.js` to import the PWA helpers and run them on startup.

**1. Add Import at the top of the file:**
```javascript
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/app.js
// Insert around line 16 (after providers.js import):
import { registerServiceWorker, setupInstall, promptInstall, IOS_INSTALL_HINT } from './pwa-install.js';
```

**2. Wire up Startup in `init()`:**
```javascript
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/app.js
// Insert at the start of init() (around line 190):
async function init() {
  // Register PWA service worker
  registerServiceWorker();

  await openDB();
  await loadApiConfig();
  wireEvents();
  setActivePersona('drill');

  // Configure PWA install trigger
  setupInstall({
    button: $('installBtn'),
    onAvailable: (kind) => {
      if (kind === 'ios') {
        // For iOS, reveal the button so users have something to tap to see the guide
        const btn = $('installBtn');
        if (btn) btn.hidden = false;
      }
    },
    onInstalled: () => {
      alert('Hey Buddy added to your home screen ❤️');
    }
  });

  // Oracle timer
  updateOracleTimer();
  setInterval(updateOracleTimer, 60_000);

  // Fake player count
  dom.oraclePlayerCount.textContent = `👥 ${Math.floor(Math.random() * 200 + 50)} players today`;
}
```

**3. Wire Event Listener in `wireEvents()`:**
```javascript
// Target: /home/christopher/.gemini/antigravity/scratch/hey-buddy/app/js/app.js
// Insert inside wireEvents() (around line 622, before dom.sendBtn listener):

  // PWA Install Button handler
  const installBtn = $('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') {
        // Show the iOS install helper hint when tapped on unsupported/iOS browsers
        alert(IOS_INSTALL_HINT);
      } else {
        console.log('[HeyBuddy] PWA install outcome:', outcome);
      }
    });
  }
```

---

## 6. Verification and Validation Methods
The Implementer must run the following checks to ensure the integration is successful:

1. **Security Gate Check**:
   - Run `node scripts/nexus-gate.mjs` before committing to verify that no security rules (secrets, config-weakening, or unauthorized network hosts) are violated.
2. **Local Server Testing**:
   - Start a local HTTP server in the project root:
     ```bash
     npx serve -l 8000
     # or python3 -m http.server 8000
     ```
   - Open Chrome DevTools and navigate to `http://localhost:8000/app/index.html`.
3. **PWA Console Validation**:
   - Under **Chrome DevTools → Application**:
     - Check **Manifest**: Ensure the manifest loads correctly, shows the "Hey Buddy" name, the correct icons, and `scope` is `/app/`.
     - Check **Service Workers**: Confirm `/app/service-worker.js` is registered, active, and running.
   - Under **Chrome DevTools → Lighthouse**:
     - Run a PWA audit to verify installability and offline capabilities.
4. **Offline Capability Test**:
   - Toggle **Offline** mode in Chrome DevTools Network panel.
   - Reload `http://localhost:8000/app/index.html`. The app shell must load completely without errors.
