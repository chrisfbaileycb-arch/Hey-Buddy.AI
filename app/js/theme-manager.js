/**
 * Hey Buddy — Theme & Customization Manager
 * ===========================================
 * Handles light/dark themes, background customization, and MySpace-style personalization
 */

// State management
const themeState = {
  currentTheme: 'dark',
  currentBg: 'dark',
  customizations: {}
};

// Initialize theme system
export function initThemeManager() {
  loadUserPreferences();
  applyTheme(themeState.currentTheme);
  applyBackground(themeState.currentBg);
  setupEventListeners();
  console.log('🎨 Theme Manager initialized');
}

// Load user preferences from storage
function loadUserPreferences() {
  try {
    const saved = localStorage.getItem('hb_theme_prefs_v1');
    if (saved) {
      const prefs = JSON.parse(saved);
      themeState.currentTheme = prefs.theme || 'dark';
      themeState.currentBg = prefs.bg || 'dark';
      themeState.customizations = prefs.customizations || {};
    }
  } catch (e) {
    console.warn('Failed to load theme preferences:', e);
    themeState.currentTheme = 'dark';
    themeState.currentBg = 'dark';
  }
}

// Save user preferences
function saveUserPreferences() {
  try {
    const prefs = {
      theme: themeState.currentTheme,
      bg: themeState.currentBg,
      customizations: themeState.customizations
    };
    localStorage.setItem('hb_theme_prefs_v1', JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save theme preferences:', e);
  }
}

// Apply theme (light/dark)
export function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  themeState.currentTheme = themeName;
  saveUserPreferences();
  
  // Update UI toggles
  updateThemeUI();
}

// Apply background style
export function applyBackground(bgName) {
  document.body.setAttribute('data-user-bg', bgName);
  themeState.currentBg = bgName;
  saveUserPreferences();
  
  // Update UI toggles
  updateBgUI();
}

// Toggle between light and dark theme
export function toggleTheme() {
  const newTheme = themeState.currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  return newTheme;
}

// Setup event listeners for theme controls
function setupEventListeners() {
  // Theme toggle button
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const newTheme = toggleTheme();
      showThemeNotification(`Switched to ${newTheme} theme`);
    });
  }
  
  // Settings panel theme options
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.dataset.theme;
      if (theme) {
        applyTheme(theme);
        showThemeNotification(`Theme changed to ${theme}`);
      }
    });
  });
  
  // Background options
  document.querySelectorAll('.bg-option').forEach(option => {
    option.addEventListener('click', () => {
      const bg = option.dataset.bg;
      if (bg) {
        applyBackground(bg);
        showThemeNotification(`Background changed to ${bg}`);
      }
    });
  });
}

// Update theme UI state
function updateThemeUI() {
  document.querySelectorAll('.theme-option').forEach(option => {
    const isActive = option.dataset.theme === themeState.currentTheme;
    option.classList.toggle('active', isActive);
  });
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.textContent = themeState.currentTheme === 'dark' ? '☀️' : '🌙';
    toggleBtn.title = `Switch to ${themeState.currentTheme === 'dark' ? 'light' : 'dark'} theme`;
  }
}

// Update background UI state
function updateBgUI() {
  document.querySelectorAll('.bg-option').forEach(option => {
    const isActive = option.dataset.bg === themeState.currentBg;
    option.classList.toggle('active', isActive);
  });
}

// Show theme change notification
function showThemeNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'theme-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    padding: 0.75rem 1.5rem;
    background: var(--persona);
    color: #fff;
    border-radius: var(--r-full);
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 4px 16px var(--persona-glow);
    z-index: 9999;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Export customization data
export function exportCustomization() {
  return {
    theme: themeState.currentTheme,
    background: themeState.currentBg,
    customizations: themeState.customizations
  };
}

// Import customization data
export function importCustomization(data) {
  if (data.theme) applyTheme(data.theme);
  if (data.background) applyBackground(data.background);
  if (data.customizations) {
    themeState.customizations = { ...themeState.customizations, ...data.customizations };
  }
  saveUserPreferences();
}

// Reset to defaults
export function resetToDefaults() {
  applyTheme('dark');
  applyBackground('dark');
  themeState.customizations = {};
  saveUserPreferences();
  showThemeNotification('Reset to default theme');
}

// Get available themes
export function getAvailableThemes() {
  return [
    { id: 'dark', name: 'Dark', icon: '🌙' },
    { id: 'light', name: 'Light', icon: '☀️' }
  ];
}

// Get available backgrounds
export function getAvailableBackgrounds() {
  return [
    { id: 'dark', name: 'Dark Gradient', preview: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)' },
    { id: 'light', name: 'Light Gradient', preview: 'linear-gradient(135deg, #f8f9ff 0%, #e8ecff 100%)' },
    { id: 'space', name: 'Space', preview: 'radial-gradient(circle at 30% 30%, #1a1a2e 0%, #0f0f1a 100%)' },
    { id: 'nature', name: 'Nature', preview: 'linear-gradient(135deg, #134e13 0%, #0a2f0a 100%)' },
    { id: 'ocean', name: 'Ocean', preview: 'linear-gradient(135deg, #006994 0%, #003366 100%)' },
    { id: 'sunset', name: 'Sunset', preview: 'linear-gradient(135deg, #ff6b35 0%, #93005a 100%)' }
  ];
}

// Collapsible categories functionality
export function initCollapsibleCategories() {
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      const content = header.nextElementSibling;
      if (content && content.classList.contains('category-content')) {
        content.classList.toggle('collapsed');
      }
    });
  });
}

// Auto-detect system theme preference
export function detectSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

// Listen for system theme changes
export function watchSystemTheme() {
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
      const hasManualPref = localStorage.getItem('hb_theme_prefs_v1');
      if (!hasManualPref) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    });
  }
}
