(function setupAuthNav() {
  const token = localStorage.getItem('token');
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
      localStorage.removeItem('token');

      if (detailsMenu) {
        detailsMenu.removeAttribute('open');
      }
      window.location.href = '../auth/signup.html';

    });
  }

  if (profileLink) {
    profileLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate to profile page (placeholder for now)
      console.log('Navigate to Profile');
      // window.location.href = '../profile/profile.html';
      if (detailsMenu) {
        detailsMenu.removeAttribute('open');
      }
    });
  }

  if (settingsLink) {
    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate to settings page (placeholder for now)
      console.log('Navigate to Settings');
      // window.location.href = '../settings/settings.html';
      if (detailsMenu) {
        detailsMenu.removeAttribute('open');
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (detailsMenu && userWrap && !userWrap.contains(e.target)) {
      detailsMenu.removeAttribute('open');
    }
  });

})();