/**
 * pwa-install.js — Hey Buddy "Add to Home Screen" helper.
 *
 * Handles the two realities of installable web apps:
 *   - Android / Chrome / Edge: fires `beforeinstallprompt` → we can show a
 *     custom "Add Hey Buddy to your home screen" button that triggers the
 *     native install dialog.
 *   - iOS Safari: NO automatic prompt exists. We detect iOS and show a short
 *     "Tap Share → Add to Home Screen" hint instead.
 *
 * This is the friction-free first-introduction path Christopher wants: people
 * visit on their phone and get an app-like icon in one tap — no app store.
 */

let deferredPrompt = null;
let installButton = null;
let onAvailableCallback = null;
let onInstalledCallback = null;

// Register window event listeners globally at module load time
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installButton) installButton.hidden = false;
  if (onAvailableCallback) onAvailableCallback('android');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installButton) installButton.hidden = true;
  if (onInstalledCallback) onInstalledCallback();
});

/** Register the service worker (call once at startup). */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/app/service-worker.js')
        .catch((err) => console.warn('[HeyBuddy] SW registration failed:', err));
    });
  }
}

/** True if the app is already running as an installed PWA. */
export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

/**
 * Wire up install UX.
 * @param {object|HTMLElement} opts   Options object or direct button element.
 * @param {HTMLElement} [opts.button]   Optional element to reveal for Android install.
 * @param {(kind:'android'|'ios')=>void} [opts.onAvailable] Called when install is offerable.
 * @param {()=>void} [opts.onInstalled] Called after successful install.
 */
export function setupInstall(opts = {}) {
  if (isInstalled()) return; // nothing to do

  let button, onAvailable, onInstalled;
  if (opts instanceof HTMLElement) {
    button = opts;
  } else {
    ({ button, onAvailable, onInstalled } = opts || {});
  }

  installButton = button;
  onAvailableCallback = onAvailable;
  onInstalledCallback = onInstalled;

  // If prompt already fired before setupInstall was called, run the callback and show button
  if (deferredPrompt) {
    if (button) button.hidden = false;
    if (onAvailable) onAvailable('android');
  }

  // iOS Safari: no event — surface a hint so users know how to add it.
  if (isIos()) {
    if (onAvailable) onAvailable('ios');
  }
}

/**
 * Trigger the native Android/Chromium install dialog.
 * Returns 'accepted' | 'dismissed' | 'unavailable'.
 */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome; // 'accepted' | 'dismissed'
}

/** Short instruction string for iOS users (no programmatic prompt available). */
export const IOS_INSTALL_HINT =
  'To add Hey Buddy to your home screen: tap the Share button, then "Add to Home Screen."';
