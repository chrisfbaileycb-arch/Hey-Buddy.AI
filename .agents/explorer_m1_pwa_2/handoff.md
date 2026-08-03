# Handoff Report — Milestone 1: PWA Requirements Analysis

## 1. Observation
- The master build source files are located at `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/`.
- In `app/manifest.json` (lines 5-7):
  ```json
  "id": "/",
  "start_url": "/?source=pwa",
  "scope": "/",
  ```
- In `app/service-worker.js` (lines 16-25):
  ```javascript
  const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/css/sandbox-notice.css',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
  ];
  ```
- In `app/js/pwa-install.js` (line 22):
  ```javascript
  .register('/service-worker.js')
  ```
- In the workspace `/home/christopher/.gemini/antigravity/scratch/hey-buddy/`:
  - The landing page is at `/index.html`, and the main app is at `/app/index.html`.
  - In `app/index.html` (lines 15-22): Head meta tags are already present using relative paths (e.g. `manifest.json`, `icons/apple-touch-icon.png`).
  - In `app/index.html` (lines 158-159):
    ```html
    <button class="header-action-btn install-btn" id="installBtn"
            aria-label="Add Hey Buddy to home screen" hidden title="Install app">📲</button>
    ```
  - The validation script is at `/scripts/nexus-gate.mjs`.

## 2. Logic Chain
- **Scope Mismatch**: The master build files use domain-root paths (`/index.html`, `/service-worker.js`), which assumes that the `app` folder is served as the domain root. However, the workspace has a landing page at `/index.html` and a nested app at `/app/index.html`.
- **Registration & Caching Failure**: If files are copied without modifications, the service worker registration will search at `/service-worker.js` instead of `/app/service-worker.js` (resulting in a 404 error). Furthermore, caching SHELL_ASSETS like `/css/app.css` will fail with 404s since they are actually at `/app/css/app.css`.
- **Path Adjustments**: To solve this, we must update the paths in the copied files:
  - In `manifest.json`: prepend `/app` to `id`, `start_url`, and `scope`.
  - In `service-worker.js`: prepend `/app` to all shell assets (and add missing JS/security dependencies so the app boot is offline-capable).
  - In `pwa-install.js`: update registration path to `/app/service-worker.js`.
- **Wiring in app.js**: `registerServiceWorker()` and `setupInstall()` must be imported and called inside `init()` in `app/js/app.js`. The `installBtn` element must be added to the DOM references, and its click event wired to `promptInstall()` inside `wireEvents()`.
- **Cache Security**: The service worker avoids caching sensitive API keys, model downloads, and conversation history by ignoring non-`GET` requests, checking hosts against `NEVER_CACHE_HOSTS` (OpenAI, Anthropic, OpenRouter, ElevenLabs, HuggingFace), and restricting cache storage to same-origin `basic` responses.
- **Verification Gating**: Since there are no npm scripts or ESLint configurations, we use the custom `scripts/nexus-gate.mjs` script to verify there are no security, formatting, or lint-weakening issues.

## 3. Caveats
- This plan assumes the PWA is intended to run inside the `/app/` subdirectory under production. If the landing page is removed and the PWA becomes the root application, these path adjustments will need to be reverted.
- The dynamic `showToast` function is added dynamically to `app/js/app.js` using inline styles to avoid modifying core CSS files or having a dependency on third-party libraries.

## 4. Conclusion
The requirements for Milestone 1: PWA integration are fully analyzed. An implementation plan has been written to `analysis.md` detailing the file copy operations, head tags, button placement, app.js import and event wiring, service worker caching rules, and verification checks.

## 5. Verification Method
- **Static Check**: Run the security gate over the codebase:
  ```bash
  node scripts/nexus-gate.mjs --all
  ```
- **Runtime Check**: Load the app shell in a browser and verify via Chrome DevTools (Application panel):
  - Service worker status: Registered and active for `/app/` scope.
  - Manifest status: Successfully parsed with correct properties (`id`, `start_url`, `scope`).
  - Cache Storage: All shell assets successfully cached (no failed requests in network tab during SW install).
