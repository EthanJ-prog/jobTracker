function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function clearAuthToken() {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
}

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