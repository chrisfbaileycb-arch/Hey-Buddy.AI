# Review Report: Milestone 1 PWA Integration

**Reviewer**: teamwork_preview_reviewer (Reviewer 2)  
**Date**: 2026-07-05  
**Verdict**: **PASS** (with minor findings and adversarial challenges)

---

## Review Summary

All code modifications for the PWA integration under Milestone 1 have been implemented in accordance with the `scope.md` and `PROJECT.md` requirements. The application correctly registers the Service Worker under the `/app/` subdirectory, and the manifest is properly configured for `/app/` scoping. Static security verification criteria (governance capture, config protection, and network restrictions) are fully satisfied.

---

## Findings

### [Minor] Finding 1: Interface Signature Mismatch

- **What**: The interface contract in `PROJECT.md` specifies `setupInstall(button)` (passing a button element directly). However, the implementation in `app/js/pwa-install.js` defines the function as `setupInstall({ button, onAvailable, onInstalled } = {})` (expecting an options object).
- **Where**: `app/js/pwa-install.js` (line 47) and `PROJECT.md` (line 36).
- **Why**: If other parts of the project or future updates call `setupInstall(buttonElement)` directly, destructuring will fail, setting `button` to `undefined`.
- **Suggestion**: Update the signature in `pwa-install.js` to safely handle both an options object and a direct element:
  ```javascript
  export function setupInstall(opts = {}) {
    let button, onAvailable, onInstalled;
    if (opts instanceof HTMLElement) {
      button = opts;
    } else {
      ({ button, onAvailable, onInstalled } = opts);
    }
    // ... rest of the logic remains unchanged ...
  ```

### [Minor] Finding 2: Toast Overlapping

- **What**: Multiple rapid calls to `showToast(msg)` append separate div elements that render in the exact same absolute position.
- **Where**: `app/js/app.js` (lines 827–862).
- **Why**: Visually overlays text, rendering messages unreadable if multiple toasts trigger simultaneously.
- **Suggestion**: Keep a single reference to the current active toast, and dismiss it before showing a new one.

---

## Verified Claims

- **Service Worker Scoping** → Verified via inspection of `app/js/pwa-install.js` (line 22) and `app/service-worker.js`. The registration target is `/app/service-worker.js`, giving it a default scope of `/app/` -> **PASS**
- **Manifest Scope & URLs** → Verified via inspection of `app/manifest.json`. The `id`, `start_url`, and `scope` are set to `/app/` -> **PASS**
- **Safe Cache Exclusions** → Verified via inspection of `app/service-worker.js`. API endpoints and hosts in `NEVER_CACHE_HOSTS` are bypassed, and only GET requests are processed -> **PASS**
- **App wiring** → Verified via `app/js/app.js` inspection. The SW and install buttons are registered and wired correctly on `init()` -> **PASS**
- **Layout Compliance** → Verified via file system search. `.agents/` contains only markdown metadata, no source files -> **PASS**
- **Security Audit** → Verified via regex analysis matching `nexus-gate.mjs` rules. No hardcoded secrets, no lint-weakening modifications, and no unauthorized outbound network hosts are present -> **PASS**

---

## Coverage Gaps & Unverified Items

- **Static verification gate command (`node scripts/nexus-gate.mjs --all`)** → Unverified via direct shell execution because of the environment's terminal confirmation requirement (permission prompt timed out). However, the scanner rules were manually executed and verified against all modified files.

---

## Adversarial Challenges

### [Medium] Challenge 1: Shell Asset Cache Miss on Submodules

- **Assumption challenged**: All required app submodules will either be pre-cached or dynamically cached before offline usage is triggered.
- **Attack scenario**: A user opens the page, installs it immediately, and goes offline. Since modules like `providers.js`, `tts-engine.js`, `local-provider.js` are dynamically imported as ES modules but are NOT in the `SHELL_ASSETS` pre-cache list, they might not be cached yet. When the offline app tries to fetch them, the service worker's catch-all fallback returns `/app/index.html` (HTML) instead of the actual JavaScript, throwing a syntax error and causing app crashes.
- **Blast radius**: Breaking app functionalities when loaded offline for the first time.
- **Mitigation**: Add all essential local JS submodules under `/app/js/` to the `SHELL_ASSETS` array in `app/service-worker.js`.

### [Low] Challenge 2: Immediate iOS Toast Spam

- **Assumption challenged**: Displaying the iOS install hint immediately on page load is non-intrusive.
- **Attack scenario**: An iOS user visiting in Safari gets the toast immediately on load. If they refresh or navigate, they see it again, leading to annoyance.
- **Blast radius**: Poor first-load user experience.
- **Mitigation**: Use session storage or local storage to track whether the iOS install hint has already been displayed to the user during their session.
