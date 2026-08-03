# Synthesized Review Report: Milestone 1 PWA Integration

This synthesized review reconciles the findings and verdicts from Reviewer 1 (FAIL/REQUEST_CHANGES) and Reviewer 2 (PASS).

## Verdict
**FAIL / REQUEST_CHANGES** (due to critical race condition and null pointer crash risk).

---

## Required Modifications (Explorer -> Worker Loop Back)

The Worker must implement the following fixes:

### 1. [Critical] Fix Race Condition in `beforeinstallprompt` Capture
* **Problem**: `beforeinstallprompt` is currently registered inside `setupInstall` which is called during the asynchronous `init()`. The browser often fires the event before `init()` completes, causing the event to be missed.
* **Resolution**:
  * In `app/js/pwa-install.js`, register the window listener for `beforeinstallprompt` globally at module load time (outside any function) and save the event object to a local `deferredPrompt` variable.
  * In `setupInstall()`, check if `deferredPrompt` is already populated. If so, immediately trigger the `onAvailable` callback and show the button.
  * Adjust `promptInstall()` to access this shared `deferredPrompt` variable.

### 2. [Major] Fix Null Pointer Risk on `dom.installBtn`
* **Problem**: In `app/js/app.js`, `dom.installBtn.addEventListener('click', ...)` is called directly. If the button element is missing or not rendered, `dom.installBtn` is null and will throw a fatal `TypeError` that halts application execution.
* **Resolution**: Wrap the event listener registration in a check for `dom.installBtn`:
  ```javascript
  if (dom.installBtn) {
    dom.installBtn.addEventListener('click', async () => { ... });
  }
  ```

### 3. [Minor] Exclude Service Worker Script from Caching
* **Problem**: `app/service-worker.js` caches all GET requests from its own origin, which includes itself.
* **Resolution**: Add an exclusion check at the top of the `fetch` handler inside `app/service-worker.js`:
  ```javascript
  if (url.pathname === '/app/service-worker.js') {
    return;
  }
  ```

### 4. [Minor] Restrict Offline Fallback to Navigation Requests
* **Problem**: Returning `/app/index.html` as a fallback for missing CSS/JS resources causes parser errors.
* **Resolution**: In the `fetch` catch block of `app/service-worker.js`, only return `caches.match('/app/index.html')` if `req.mode === 'navigate'`:
  ```javascript
  .catch(() => {
    if (req.mode === 'navigate') {
      return caches.match('/app/index.html');
    }
  })
  ```

### 5. [Minor] Support Flexible Signatures in `setupInstall`
* **Problem**: `PROJECT.md` contracts specify `setupInstall(button)` but the implementation destructures an options object `{ button }`.
* **Resolution**: Safely handle both standard options object and direct element in `setupInstall`:
  ```javascript
  export function setupInstall(opts = {}) {
    let button, onAvailable, onInstalled;
    if (opts instanceof HTMLElement) {
      button = opts;
    } else {
      ({ button, onAvailable, onInstalled } = opts || {});
    }
    // ...
  ```

### 6. [Minor] Visual Toast Improvements
* **Problem**: Rapid calls to `showToast` create overlapping overlays.
* **Resolution**: Keep a reference to the active toast element and remove it before displaying a new one.

---

## Static Gate Verification
The static verification command `node scripts/nexus-gate.mjs --all` must run successfully. The Worker must propose and verify that the command executes and passes.
