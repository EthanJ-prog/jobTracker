
(function setupAuthNav() {
  const token = localStorage.getItem('token');
  const loginLink = document.getElementById('nav-login'); 
  const userWrap = document.getElementById('nav-user-wrap');
  const signOutButton = document.getElementById('nav-signout');
  const detailsMenu = document.getElementById('user-menu-details');

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
      window.location.href = '../Login/Signup/Login/Login/signup.html';

    });

  }
})();