/**
 * theme-init.js — bootstraps the theme system.
 * Lives in its own file (not inline) because the app's CSP is
 * script-src 'self', which blocks inline scripts.
 */
import { initThemeManager, watchSystemTheme } from './theme-manager.js';

/** Keep the browser/status-bar theme-color meta in sync with the active theme. */
function syncThemeColor() {
  const themeColorMeta = document.getElementById('themeColorMeta');
  if (!themeColorMeta) return;
  const isLight = document.body.getAttribute('data-theme') === 'light';
  themeColorMeta.setAttribute('content', isLight ? '#f8f9ff' : '#0f1220');
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  watchSystemTheme();

  // React to any later theme change.
  const observer = new MutationObserver(syncThemeColor);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  // Sync once now: initThemeManager() already applied the saved theme before
  // this observer existed, and MutationObserver never replays that initial
  // mutation — so without this call a restored light theme keeps a dark bar.
  syncThemeColor();
});
