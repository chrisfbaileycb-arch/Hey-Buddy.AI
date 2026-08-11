/**
 * theme-init.js — bootstraps the theme system.
 * Lives in its own file (not inline) because the app's CSP is
 * script-src 'self', which blocks inline scripts.
 */
import { initThemeManager, watchSystemTheme } from './theme-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  watchSystemTheme();

  // Update theme color meta tag dynamically
  const observer = new MutationObserver(() => {
    const themeColorMeta = document.getElementById('themeColorMeta');
    const isLight = document.body.getAttribute('data-theme') === 'light';
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isLight ? '#f8f9ff' : '#0f1220');
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
});
