/**
 * theme-init.js — bootstraps the theme system.
 * Lives in its own file (not inline) because the app's CSP is
 * script-src 'self', which blocks inline scripts.
 */
import { initThemeManager, watchSystemTheme, THEMES } from './theme-manager.js';

/** Keep the browser/status-bar theme-color meta in sync with the active theme. */
function syncThemeColor() {
  const themeColorMeta = document.getElementById('themeColorMeta');
  if (!themeColorMeta) return;
  const active = document.body.getAttribute('data-theme');
  // Resolve from the theme table so new themes don't silently keep a stale
  // status-bar color (the dark default used to leak onto every light theme).
  const meta = THEMES.find(t => t.id === active) || THEMES[0];
  themeColorMeta.setAttribute('content', meta.themeColor);
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
