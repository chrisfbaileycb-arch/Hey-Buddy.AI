# Handoff Report — worker_m1_pwa_gen2

## 1. Observation
- **Synthesized Review Report (`synthesis_review.md`)**:
  - Finding 1: Race Condition in `beforeinstallprompt` Capture. `beforeinstallprompt` was registered inside `setupInstall` (lines 51-56 in the original `pwa-install.js`), which was called after asynchronous `init()` tasks (`openDB()`, `loadApiConfig()`), causing the event to be missed.
  - Finding 2: Unhandled Null Pointer Exception on `dom.installBtn` in `app/js/app.js` (line 864 in the original file: `dom.installBtn.addEventListener('click', ...)`). If the element is absent, it throws a fatal TypeError.
  - Finding 3: Caching of the Service Worker Script in `app/service-worker.js` (lines 70-87 in original file).
  - Finding 4: Inappropriate Fallback for Static Assets in `app/service-worker.js`. Returning `/app/index.html` on any request failure causes console/parse errors for CSS/JS/images.
  - Finding 5: Interface Signature Mismatch. `PROJECT.md` specified `setupInstall(button)` but the implementation expected an options object.
  - Finding 6: Toast Overlapping. Rapid calls to `showToast` create overlapping div overlays.
- **Codebase State**:
  - Verbatim original code in `app/js/pwa-install.js` lines 47-56:
    ```javascript
    export function setupInstall({ button, onAvailable, onInstalled } = {}) {
      if (isInstalled()) return; // nothing to do

      // Android / Chromium: capture the prompt for later.
      window.addEventListener('beforeinstallprompt', (e) => { ... });
    ```
  - Verbatim original code in `app/js/app.js` line 864:
    ```javascript
    dom.installBtn.addEventListener('click', async () => { ... });
    ```
  - Verbatim original code in `app/service-worker.js` lines 71-87:
    ```javascript
    if (url.origin === self.location.origin) {
      event.respondWith(
        caches.match(req).then((cached) => {
          ...
          return fetch(req)
            ...
            .catch(() => caches.match('/app/index.html'));
        })
      );
    }
    ```
- **Shell Command Result**:
  - Running `node scripts/nexus-gate.mjs --all` encountered a permission prompt timeout in this autonomous/offline execution environment: `Encountered error in step execution: Permission prompt for action 'command' on target 'node scripts/nexus-gate.mjs --all' timed out waiting for user response.`

## 2. Logic Chain
- **Race Condition Resolution**: By moving the event listener registration for `beforeinstallprompt` and `appinstalled` to module load time, the browser captures the event immediately even before asynchronous database / API key setup in `app.js` completes. Since we store callbacks/elements in module-scoped variables (`installButton`, `onAvailableCallback`, `onInstalledCallback`) inside `setupInstall`, and check `if (deferredPrompt)` inside `setupInstall`, we handle both cases where the prompt fires before or after `setupInstall` runs.
- **Null Safety**: Wrapping `dom.installBtn.addEventListener` in `if (dom.installBtn)` prevents the fatal TypeError crash if the install button is not present on the loaded page.
- **Service Worker Cache Bypass**: Adding `if (url.pathname === '/app/service-worker.js') { return; }` at the top of the `fetch` listener prevents the service worker from intercepting and caching its own script.
- **Restricting Fallback**: Restricting the `.catch()` handler in `app/service-worker.js` to only return the `/app/index.html` cache match `if (req.mode === 'navigate')` ensures static resource fetch failures (like CSS, images, and modules) do not return HTML content.
- **Flexible Signatures**: Adding a check `if (opts instanceof HTMLElement)` inside `setupInstall` allows it to accept both standard DOM element arguments (conforming to `PROJECT.md`) and the destructured options object.
- **Toast Overlapping Fix**: Keeping a module-scoped reference `activeToast` and calling `activeToast.remove()` before showing a new toast resolves the text overlapping.

## 3. Caveats
- Since running terminal commands requires user confirmation and timed out, the validation script `node scripts/nexus-gate.mjs --all` could not be executed to completion. However, all rules in `nexus-gate.mjs` were manually verified against the changes:
  - No hardcoded secrets were added.
  - No lint-weakening lines or config files were touched.
  - No literal outbound HTTP URLs or endpoint overrides were introduced.

## 4. Conclusion
All identified PWA integration issues, interface mismatch issues, race conditions, null pointer risks, and visual toast overlapping problems have been successfully fixed with clean, minimal-change implementations in `app/js/pwa-install.js`, `app/js/app.js`, and `app/service-worker.js`.

## 5. Verification Method
1. Run the static verification gate:
   ```bash
   node scripts/nexus-gate.mjs --all
   ```
   Verify that it exits with `0` (no violations found).
2. Inspect the modified files to verify the implemented logic:
   - Check `app/js/pwa-install.js`: ensure `beforeinstallprompt` is registered at module load time, and `setupInstall` supports both a direct HTML element or options object.
   - Check `app/js/app.js`: verify the `if (dom.installBtn)` check and the toast overlapping protection.
   - Check `app/service-worker.js`: ensure `/app/service-worker.js` is excluded from the cache, and `/app/index.html` fallback is restricted to `req.mode === 'navigate'`.
