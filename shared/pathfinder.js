window.Pathfinder = (() => {
  const SESSION_EXPIRED = 'SESSION_EXPIRED';

  function getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  function clearAuthToken() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
  }

  function authHeaders(extraHeaders = {}) {
    const token = getAuthToken();
    const headers = { ...extraHeaders };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  function redirectToLogin(loginPath = '../auth/signup.html') {
    clearAuthToken();
    window.location.href = loginPath;
  }

  function handleExpiredSession(response, loginPath) {
    if (response.status === 401 || response.status === 403) {
      redirectToLogin(loginPath);
      throw new Error(SESSION_EXPIRED);
    }
  }

  async function readErrorMessage(response, fallback = 'Request failed') {
    const errorText = await response.text();
    if (!errorText || !errorText.trim()) {
      return fallback;
    }

    try {
      const error = JSON.parse(errorText);
      return error.error || error.message || fallback;
    } catch (_) {
      return errorText.trim();
    }
  }

  async function apiJson(baseUrl, endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders(options.headers || {})
    };
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    handleExpiredSession(response);

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  function showPopup(popupId) {
    const backdrop = document.getElementById('popup-backdrop');
    const detailsMenu = document.getElementById('user-menu-details');

    if (detailsMenu) {
      detailsMenu.removeAttribute('open');
    }

    document.querySelectorAll('.popup-panel').forEach((popup) => {
      popup.setAttribute('hidden', '');
    });

    if (backdrop) {
      backdrop.removeAttribute('hidden');
    }

    const popup = document.getElementById(popupId);
    if (popup) {
      popup.removeAttribute('hidden');
    }

    document.body.classList.add('modal-open');
  }

  function hidePopups() {
    const backdrop = document.getElementById('popup-backdrop');

    if (backdrop) {
      backdrop.setAttribute('hidden', '');
    }

    document.querySelectorAll('.popup-panel').forEach((popup) => {
      popup.setAttribute('hidden', '');
    });

    document.body.classList.remove('modal-open');
  }

  function setupPopupHandlers() {
    document.querySelectorAll('.popup-close').forEach((button) => {
      button.addEventListener('click', hidePopups);
    });

    const backdrop = document.getElementById('popup-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', hidePopups);
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hidePopups();
      }
    });
  }

  function setupAuthNav(options = {}) {
    const loginPath = options.loginPath || '../auth/signup.html';
    const token = getAuthToken();
    const loginLink = document.getElementById('nav-login');
    const userWrap = document.getElementById('nav-user-wrap');
    const signOutButton = document.getElementById('nav-signout');
    const detailsMenu = document.getElementById('user-menu-details');
    const profileLink = document.getElementById('nav-profile');
    const settingsLink = document.getElementById('nav-settings');

    if (loginLink) {
      loginLink.style.display = token ? 'none' : 'inline-flex';
    }
    if (userWrap) {
      userWrap.style.display = token ? 'block' : 'none';
    }

    if (signOutButton) {
      signOutButton.addEventListener('click', () => {
        clearAuthToken();
        if (detailsMenu) {
          detailsMenu.removeAttribute('open');
        }
        window.location.href = loginPath;
      });
    }

    if (profileLink) {
      profileLink.addEventListener('click', (event) => {
        event.preventDefault();
        showPopup('profile-popup');
      });
    }

    if (settingsLink) {
      settingsLink.addEventListener('click', (event) => {
        event.preventDefault();
        showPopup('settings-popup');
      });
    }

    setupPopupHandlers();

    document.addEventListener('click', (event) => {
      if (detailsMenu && userWrap && !userWrap.contains(event.target)) {
        detailsMenu.removeAttribute('open');
      }
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatProfileDate(value) {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function populateProfile(profile) {
    const joinedDate = formatProfileDate(profile.created_at);
    setText('profile-name', profile.name || 'Not set');
    setText('profile-email', profile.email || '');
    setText('profile-joined', joinedDate);
    setText('profile-email-display', profile.email || '');
    setText('profile-joined-display', joinedDate);

    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) {
      nameInput.value = profile.name || '';
    }
  }

  function toggleProfileEditMode(isEdit) {
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');

    if (viewMode) {
      viewMode.style.display = isEdit ? 'none' : 'block';
    }
    if (editMode) {
      editMode.style.display = isEdit ? 'block' : 'none';
    }
  }

  async function loadUserProfile(baseUrl, afterLoad) {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${baseUrl}/api/user/profile`, {
        method: 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' })
      });

      if (!response.ok) {
        console.error('Failed to load profile:', response.status);
        return;
      }

      const profile = await response.json();
      populateProfile(profile);

      if (typeof afterLoad === 'function') {
        await afterLoad(profile);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  }

  async function saveUserProfile(baseUrl, reloadProfile) {
    const token = getAuthToken();
    if (!token) return;

    const nameInput = document.getElementById('profile-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      alert('Name cannot be empty');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/user/profile`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, 'Unknown error');
        alert(`Failed to save profile: ${message}`);
        return;
      }

      if (typeof reloadProfile === 'function') {
        await reloadProfile();
      }
      toggleProfileEditMode(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(`Error saving profile: ${error.message}`);
    }
  }

  function update2FAStatus(enabled) {
    const toggle = document.getElementById('twofa-toggle');
    const status = document.getElementById('twofa-status');

    if (toggle) {
      toggle.checked = enabled;
    }
    if (status) {
      status.textContent = `Status: ${enabled ? '✓ Enabled' : '✗ Disabled'}`;
      status.style.color = enabled ? '#059669' : '#6b7280';
    }
  }

  async function load2FAStatus(baseUrl) {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${baseUrl}/api/user/2fa-status`, {
        method: 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' })
      });

      if (!response.ok) {
        console.error('Failed to load 2FA status:', response.status);
        return;
      }

      const data = await response.json();
      update2FAStatus(data.two_factor_enabled);
    } catch (error) {
      console.error('Error loading 2FA status:', error);
    }
  }

  async function toggle2FA(baseUrl, event) {
    const token = getAuthToken();
    if (!token) return;

    const enable = event.target.checked;

    try {
      const response = await fetch(`${baseUrl}/api/user/2fa-toggle`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enable })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, 'Unknown error');
        alert(`Failed to update 2FA: ${message}`);
        await load2FAStatus(baseUrl);
        return;
      }

      update2FAStatus(enable);
    } catch (error) {
      console.error('Error toggling 2FA:', error);
      alert(`Error updating 2FA: ${error.message}`);
      await load2FAStatus(baseUrl);
    }
  }

  function observePopupOpen(popupId, callback) {
    const popup = document.getElementById(popupId);
    if (!popup) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'hidden' && !popup.hasAttribute('hidden')) {
          callback();
        }
      });
    });

    observer.observe(popup, { attributes: true });
  }

  function setupProfileSettings(options) {
    const { baseUrl, loadProfile, saveProfile, loadSettings, toggleTwoFactor, onCancelProfile } = options;
    const loadProfileHandler = loadProfile || (() => loadUserProfile(baseUrl));
    const saveProfileHandler = saveProfile || (() => saveUserProfile(baseUrl, loadProfileHandler));
    const loadSettingsHandler = loadSettings || (() => load2FAStatus(baseUrl));
    const toggleTwoFactorHandler = toggleTwoFactor || ((event) => toggle2FA(baseUrl, event));

    const editBtn = document.getElementById('profile-edit-btn');
    const saveBtn = document.getElementById('profile-save-btn');
    const cancelBtn = document.getElementById('profile-cancel-btn');
    const twoFAToggle = document.getElementById('twofa-toggle');

    if (editBtn) {
      editBtn.addEventListener('click', () => toggleProfileEditMode(true));
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', saveProfileHandler);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        toggleProfileEditMode(false);
        if (typeof onCancelProfile === 'function') {
          onCancelProfile();
        } else {
          loadProfileHandler();
        }
      });
    }
    if (twoFAToggle) {
      twoFAToggle.addEventListener('change', toggleTwoFactorHandler);
    }

    observePopupOpen('profile-popup', loadProfileHandler);
    observePopupOpen('settings-popup', loadSettingsHandler);
  }

  return {
    SESSION_EXPIRED,
    getAuthToken,
    clearAuthToken,
    authHeaders,
    redirectToLogin,
    handleExpiredSession,
    readErrorMessage,
    apiJson,
    showPopup,
    hidePopups,
    setupPopupHandlers,
    setupAuthNav,
    escapeHtml,
    populateProfile,
    toggleProfileEditMode,
    loadUserProfile,
    saveUserProfile,
    load2FAStatus,
    toggle2FA,
    observePopupOpen,
    setupProfileSettings
  };
})();
