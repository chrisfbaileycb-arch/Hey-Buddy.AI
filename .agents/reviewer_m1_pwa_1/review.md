## Review Summary

**Verdict**: REQUEST_CHANGES (FAIL)

The PWA integration meets the structural and scoping requirements under the `/app/` subdirectory. However, there are significant functional and robustness issues—most notably a critical race condition that can cause the home screen install prompt to never be shown to users.

---

## Findings

### [Critical] Finding 1: Race Condition in `beforeinstallprompt` Capture

- **What**: The `beforeinstallprompt` event is captured inside the `setupInstall` function, which is registered during `init()`.
- **Where**: `app/js/pwa-install.js` (lines 51-56) and `app/js/app.js` (lines 198-210)
- **Why**: `init()` is asynchronous and performs database and config loading (`await openDB()`, `await loadApiConfig()`). The browser often fires the `beforeinstallprompt` event early during page load, before these asynchronous tasks resolve. Because `setupInstall` has not yet run, the window listener for `beforeinstallprompt` is not registered in time, and the event is missed. Consequently, the install button remains hidden and the PWA cannot be installed via the UI.
- **Suggestion**: Register the window listener for `beforeinstallprompt` globally in `pwa-install.js` at module load time so that the event is captured immediately. Store the event in `deferredPrompt`. In `setupInstall`, check if `deferredPrompt` is already set and, if so, trigger the `onAvailable` callback and reveal the button immediately.

### [Major] Finding 2: Unhandled Null Pointer Exception on `dom.installBtn`

- **What**: The application registers a click event listener on `dom.installBtn` without verifying that the element exists.
- **Where**: `app/js/app.js` (line 813)
- **Why**: If the install button is removed from `app/index.html` (or if `app.js` is loaded on a page without this element), `dom.installBtn` will be `null`. Calling `.addEventListener()` on `null` will throw a `TypeError` and crash the entire application initialization.
- **Suggestion**: Check if `dom.installBtn` is non-null before adding the event listener:
  ```javascript
  if (dom.installBtn) {
    dom.installBtn.addEventListener('click', async () => { ... });
  }
  ```

### [Minor] Finding 3: Caching of the Service Worker Script

- **What**: The service worker's `fetch` handler intercepts all same-origin GET requests, including requests for `/app/service-worker.js`, and puts them in the cache.
- **Where**: `app/service-worker.js` (lines 70-87)
- **Why**: It is a recommended best practice to explicitly exclude the service worker file itself from being cached in the Service Worker's cache. Caching the service worker script can complicate updates in certain scenarios.
- **Suggestion**: Add a check to bypass the cache for the service worker file:
  ```javascript
  if (url.pathname === '/app/service-worker.js') return;
  ```

### [Minor] Finding 4: Inappropriate Fallback for Static Assets

- **What**: In the fetch catch block, the service worker returns `/app/index.html` as a fallback for any failed same-origin request.
- **Where**: `app/service-worker.js` (line 84)
- **Why**: Serving the HTML shell as a fallback for missing CSS files, scripts, or images can cause console errors or parse failures in the browser. Fallbacks should ideally be restricted to navigation requests.
- **Suggestion**: Only return `/app/index.html` when `event.request.mode === 'navigate'`:
  ```javascript
  .catch(() => {
    if (req.mode === 'navigate') {
      return caches.match('/app/index.html');
    }
  })
  ```

---

## Verified Claims

- **PWA Scoped under `/app/`** → Verified by inspecting `app/manifest.json` (`id`, `start_url`, and `scope` are set to `/app/` related paths) → **PASS**
- **Service Worker Scoping** → Verified by checking registration path `/app/service-worker.js` in `app/js/pwa-install.js` → **PASS**
- **Offline Shell Asset Paths** → Verified by checking `SHELL_ASSETS` in `app/service-worker.js` (all paths prefixed with `/app/`) → **PASS**
- **PWA Icons Presence** → Checked `/app/icons/` directory; all 13 required icon files exist with correct dimensions → **PASS**
- **Robust showToast Utility** → Checked custom pure JavaScript toast implementation in `app/js/app.js` → **PASS**

---

## Coverage Gaps

- **Static verification check execution** — Risk level: Low — Recommendation: The static verification check (`node scripts/nexus-gate.mjs --all`) could not be run because the environment requires active user permission confirmations for command execution, which timed out. An offline check of the rules in `nexus-gate.mjs` against the modified files indicates no secrets, no lint-weakening, and no unauthorized network calls were introduced.

---

## Unverified Items

- **Actual PWA installation behaviour in a real browser** — The review was performed strictly via code inspection and static analysis; live browser interaction was not tested.
