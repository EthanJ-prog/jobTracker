/**
 * Return the stored authentication token, preferring long-lived localStorage
 * but falling back to sessionStorage when present. Used to authenticate API calls.
 * @returns {string|null}
 */
function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Clear any stored authentication tokens from both storage locations.
 * Called on sign-out or when the session is invalidated.
 */
function clearAuthToken() {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
}

/**
 * Display a named popup element and show the backdrop. Hides other
 * popups and collapses the details menu to ensure only one overlay is visible.
 */
function showPopup(popupId) {
  const backdrop = document.getElementById('popup-backdrop');
  const detailsMenu = document.getElementById('user-menu-details');
  const profilePopup = document.getElementById('profile-popup');
  const settingsPopup = document.getElementById('settings-popup');

  if (detailsMenu) {
    detailsMenu.removeAttribute('open');
  }

  if (profilePopup) {
    profilePopup.setAttribute('hidden', '');
  }
  if (settingsPopup) {
    settingsPopup.setAttribute('hidden', '');
  }

  if (backdrop) {
    backdrop.removeAttribute('hidden');
  }

  const popup = document.getElementById(popupId);
  if (popup) {
    popup.removeAttribute('hidden');
  }
  document.body.classList.add('modal-open');
}

/**
 * Hide all popups and remove the modal backdrop class from the body.
 */
function hidePopups() {
  const backdrop = document.getElementById('popup-backdrop');
  const profilePopup = document.getElementById('profile-popup');
  const settingsPopup = document.getElementById('settings-popup');

  if (backdrop) {
    backdrop.setAttribute('hidden', '');
  }
  if (profilePopup) {
    profilePopup.setAttribute('hidden', '');
  }
  if (settingsPopup) {
    settingsPopup.setAttribute('hidden', '');
  }
  document.body.classList.remove('modal-open');
}

// Wire popup close/open handlers for backdrop clicks, close buttons, and Escape key.
function setupPopupHandlers() {
  const backdrop = document.getElementById('popup-backdrop');
  const closeButtons = document.querySelectorAll('.popup-close');

  closeButtons.forEach((button) => {
    button.addEventListener('click', hidePopups);
  });

  if (backdrop) {
    backdrop.addEventListener('click', hidePopups);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hidePopups();
    }
  });
}

(function setupAuthNav() {
  const token = getAuthToken();
  const loginLink = document.getElementById('nav-login'); 
  const userWrap = document.getElementById('nav-user-wrap');
  const signOutButton = document.getElementById('nav-signout');
  const detailsMenu = document.getElementById('user-menu-details');
  const profileLink = document.getElementById('nav-profile');
  const settingsLink = document.getElementById('nav-settings');

  if (token) {
    if (loginLink) loginLink.style.display = 'none';

    if (userWrap) userWrap.style.display = 'block';
  
  } else {
    if (loginLink) loginLink.style.display = 'inline-flex';

    if (userWrap) userWrap.style.display = 'none';

  }

  if (signOutButton) {
    signOutButton.addEventListener('click', () => {
      clearAuthToken();

      if (detailsMenu) {
        detailsMenu.removeAttribute('open');
      }
      window.location.href = '../auth/signup.html';

    });
  }

  if (profileLink) {
    profileLink.addEventListener('click', (e) => {
      e.preventDefault();
      showPopup('profile-popup');
    });
  }

  if (settingsLink) {
    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      showPopup('settings-popup');
    });
  }

  setupPopupHandlers();

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (detailsMenu && userWrap && !userWrap.contains(e.target)) {
      detailsMenu.removeAttribute('open');
    }
  });

})();

// API endpoint base URL
const API_URL = 'http://localhost:3000';

/**
 * Load user profile data from the server and display it
 */
async function loadUserProfile() {
  try {
    const token = getAuthToken();
    if (!token) return;

    const response = await fetch(`${API_URL}/api/user/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to load profile:', response.status);
      return;
    }

    const profile = await response.json();

    // Display profile data
    document.getElementById('profile-name').textContent = profile.name || 'Not set';
    document.getElementById('profile-email').textContent = profile.email || '';
    document.getElementById('profile-joined').textContent = new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // For edit mode
    document.getElementById('profile-email-display').textContent = profile.email || '';
    document.getElementById('profile-joined-display').textContent = new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('profile-name-input').value = profile.name || '';

  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

/**
 * Toggle between view and edit modes for the profile
 */
function toggleProfileEditMode(isEdit) {
  const viewMode = document.getElementById('profile-view-mode');
  const editMode = document.getElementById('profile-edit-mode');

  if (isEdit) {
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
  } else {
    viewMode.style.display = 'block';
    editMode.style.display = 'none';
  }
}

/**
 * Save the updated profile name
 */
async function saveUserProfile() {
  try {
    const token = getAuthToken();
    if (!token) return;

    const name = document.getElementById('profile-name-input').value.trim();
    if (!name) {
      alert('Name cannot be empty');
      return;
    }

    const response = await fetch(`${API_URL}/api/user/profile`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to save profile: ' + (error.error || 'Unknown error'));
      return;
    }

    // Reload profile and close edit mode
    await loadUserProfile();
    toggleProfileEditMode(false);

  } catch (error) {
    console.error('Error saving profile:', error);
    alert('Error saving profile: ' + error.message);
  }
}

/**
 * Load 2FA status from the server
 */
async function load2FAStatus() {
  try {
    const token = getAuthToken();
    if (!token) return;

    const response = await fetch(`${API_URL}/api/user/2fa-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to load 2FA status:', response.status);
      return;
    }

    const data = await response.json();
    const toggle = document.getElementById('twofa-toggle');
    const status = document.getElementById('twofa-status');

    if (toggle) {
      toggle.checked = data.two_factor_enabled;
    }

    if (status) {
      status.textContent = `Status: ${data.two_factor_enabled ? '✓ Enabled' : '✗ Disabled'}`;
      status.style.color = data.two_factor_enabled ? '#059669' : '#6b7280';
    }

  } catch (error) {
    console.error('Error loading 2FA status:', error);
  }
}

/**
 * Toggle 2FA on/off
 */
async function toggle2FA(event) {
  try {
    const token = getAuthToken();
    if (!token) return;

    const enable = event.target.checked;
    const response = await fetch(`${API_URL}/api/user/2fa-toggle`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enable })
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to update 2FA: ' + (error.error || 'Unknown error'));
      // Reload status on failure
      await load2FAStatus();
      return;
    }

    const status = document.getElementById('twofa-status');
    if (status) {
      status.textContent = `Status: ${enable ? '✓ Enabled' : '✗ Disabled'}`;
      status.style.color = enable ? '#059669' : '#6b7280';
    }

  } catch (error) {
    console.error('Error toggling 2FA:', error);
    alert('Error updating 2FA: ' + error.message);
    // Reload status on failure
    await load2FAStatus();
  }
}

/**
 * Delete user account - permanently removes the account and all associated data
 */
async function deleteUserAccount() {
  try {
    const token = getAuthToken();
    if (!token) return;

    // Get user email to show in confirmation
    const emailElement = document.getElementById('profile-email');
    const email = emailElement ? emailElement.textContent : 'your account';

    // Double confirmation dialog
    const firstConfirm = confirm(
      `Are you sure you want to delete your account (${email})?\n\nThis action cannot be undone and will permanently delete all your data, including saved jobs and application tracking.`
    );

    if (!firstConfirm) {
      return;
    }

    // Second confirmation for extra safety
    const secondConfirm = confirm(
      'This is your final warning. All data will be deleted permanently. Do you want to continue?'
    );

    if (!secondConfirm) {
      return;
    }

    const response = await fetch(`${API_URL}/api/user/account`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      alert('Failed to delete account: ' + (error.error || 'Unknown error'));
      return;
    }

    // Account deleted successfully
    alert('Your account has been deleted successfully.');
    
    // Clear auth and redirect to signup
    clearAuthToken();
    window.location.href = '../auth/signup.html';

  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Error deleting account: ' + error.message);
  }
}

/**
 * Setup profile popup event handlers
 */
document.addEventListener('DOMContentLoaded', function() {
  const editBtn = document.getElementById('profile-edit-btn');
  const saveBtn = document.getElementById('profile-save-btn');
  const cancelBtn = document.getElementById('profile-cancel-btn');
  const deleteBtn = document.getElementById('profile-delete-btn');

  if (editBtn) {
    editBtn.addEventListener('click', () => toggleProfileEditMode(true));
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveUserProfile);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      toggleProfileEditMode(false);
      // Reload profile data to reset form
      loadUserProfile();
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteUserAccount);
  }

  // Load profile when popup is shown
  const profilePopup = document.getElementById('profile-popup');
  if (profilePopup) {
    // Use MutationObserver to detect when popup is shown
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
          if (!profilePopup.hasAttribute('hidden')) {
            loadUserProfile();
          }
        }
      });
    });

    observer.observe(profilePopup, { attributes: true });
  }

  // Setup 2FA toggle
  const twoFAToggle = document.getElementById('twofa-toggle');
  if (twoFAToggle) {
    twoFAToggle.addEventListener('change', toggle2FA);
  }

  // Load 2FA status when settings popup is shown
  const settingsPopup = document.getElementById('settings-popup');
  if (settingsPopup) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
          if (!settingsPopup.hasAttribute('hidden')) {
            load2FAStatus();
          }
        }
      });
    });

    observer.observe(settingsPopup, { attributes: true });
  }
});