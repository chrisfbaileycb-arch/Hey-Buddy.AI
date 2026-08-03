# Synthesis Report: Milestone 1 PWA Requirements Analysis

This synthesis aggregates and reconciles the findings from Explorer 1, 2, and 3 for Milestone 1: PWA integration.

## Consensus

### 1. File Copy Mappings
We must copy the following paths from the master build `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/` to the workspace:
* `manifest.json` -> `app/manifest.json`
* `service-worker.js` -> `app/service-worker.js`
* `js/pwa-install.js` -> `app/js/pwa-install.js`
* `icons/` (directory) -> `app/icons/`

### 2. Path Mismatch & Subdirectory Scope (`/app/`)
* **Problem**: The master build assumes the PWA is served at the domain root (`/`), whereas in the workspace the app shell is nested in the `/app/` subdirectory (since the repo root has a landing page at `/index.html`).
* **Resolutions**:
  * **Manifest**: In `app/manifest.json`, set `"id": "/app/"`, `"start_url": "/app/?source=pwa"`, and `"scope": "/app/"`.
  * **Service Worker Registry**: In `app/js/pwa-install.js`, register the service worker scope as `./service-worker.js` or `/app/service-worker.js`.
  * **Service Worker Assets**: In `app/service-worker.js`, adjust `SHELL_ASSETS` to be relative (e.g. `./css/app.css`) or prefix them with `/app/` (e.g. `/app/css/app.css`).

### 3. HTML Changes (`app/index.html`)
* **Head Meta Tags**: PWA head tags are already present in `app/index.html` lines 15–22. They use relative paths (`manifest.json`, `icons/apple-touch-icon.png`) which correctly resolve.
* **Install Button**: The `#installBtn` button is already present in `app/index.html` at line 158. No HTML layout changes are needed.

### 4. Logic Wiring (`app/js/app.js`)
* **Imports**: Import `registerServiceWorker`, `setupInstall`, and `promptInstall` from `./pwa-install.js`.
* **Initialization**: Call `registerServiceWorker()` and `setupInstall(dom.installBtn)` in `init()`.
* **Event Handling**: Add click event listener to `installBtn` to trigger PWA installation via `promptInstall()`.
* **iOS UX**: On iOS, Safari does not support the standard `beforeinstallprompt` event. If `promptInstall()` returns `'unavailable'`, show a custom toast with iOS share-sheet installation instructions (`IOS_INSTALL_HINT`).

### 5. Caching & Security
* The service worker ignores non-`GET` requests, enforces same-origin caching, and uses `NEVER_CACHE_HOSTS` to avoid caching API keys or external AI model downloads. No sensitive storage or cryptographic keys are cached.

### 6. Linting & Verification
* Run `node scripts/nexus-gate.mjs --all` to verify that formatting, security scans, and code integrity pass.

## Resolved Conflicts
No conflicts were identified between the Explorers. They all agreed on the file mappings, the `/app/` subdirectory prefix requirement, and the logic wiring in `app.js`.

## Dissenting Views
None.

## Gaps
None. All aspects of the integration requested in `scope.md` are covered.
