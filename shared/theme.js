(function initializeTheme() {
  const storageKey = 'pathfinder-theme';
  const root = document.documentElement;

  function getPreferredTheme() {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
      button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      button.setAttribute('title', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    });
  }

  function createToggle(isFloating) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isFloating ? 'theme-toggle theme-toggle-floating' : 'theme-toggle';
    button.dataset.themeToggle = 'true';
    // Sun shows in light mode, moon shows in dark mode (toggled via CSS).
    button.innerHTML = `
      <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
      </svg>
      <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    return button;
  }

  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('[data-theme-toggle]')) return;
    const navLinks = document.querySelector('.nav-links');
    const toggle = createToggle(!navLinks);
    if (navLinks) {
      navLinks.appendChild(toggle);
    } else {
      document.body.appendChild(toggle);
    }
    applyTheme(root.dataset.theme || getPreferredTheme());
  });
}());
