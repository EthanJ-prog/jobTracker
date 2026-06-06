// Base API URL used by the signup/login pages
const API_URL = 'http://localhost:3000';
// Temp state used when two-factor authentication is required
let pendingUserID = null;
let pendingRememberMe = false;

/**
 * Return the stored authentication token from local or session storage.
 * @returns {string|null}
 */
function getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Persist an authentication token. When `remember` is true the token is
 * stored in localStorage (survives browser close); otherwise sessionStorage
 * is used (cleared on tab close).
 */
function saveAuthToken(token, remember = false) {
    if (remember) {
        localStorage.setItem('token', token);
    } else {
        sessionStorage.setItem('token', token);
    }
}

/**
 * Remove any stored auth tokens from both storage locations.
 */
function clearAuthToken() {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
}

// Switch visible tab panels on the signup/login page.
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));

    // Show the selected tab content
    document.getElementById(tabName).classList.add('active');

    tabButtons.forEach(button => {
        if (button.textContent.toLowerCase().includes(tabName)){
            button.classList.add('active');
        }
    });
}

// Toast notification system used across the auth flow for lightweight alerts
function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toast-container');
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Set icon based on type
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function showTwoFactorOverlay() {
    document.getElementById('twofactor-overlay').style.display = 'flex';
    document.getElementById('overlay-verification-code').focus();
}

function hideTwoFactorOverlay() {
    document.getElementById('twofactor-overlay').style.display = 'none';
    document.getElementById('overlay-verification-code').value = '';
}

async function verify2FACode() {
    const code = document.getElementById('overlay-verification-code').value;

    if (!code || code.length !== 6) {
        showToast('Please enter a valid 6-digit code', 'error');
        return;
    }

    try {
        const res = await fetch(API_URL + '/api/auth/2fa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: pendingUserID, code: code, rememberMe: pendingRememberMe })
        });
        const data = await res.json();

        if (res.ok && data.authenticated) {
            saveAuthToken(data.token, pendingRememberMe);
            pendingUserID = null;
            pendingRememberMe = null;
            hideTwoFactorOverlay();
            showToast('Login successful!', 'success');
            window.location.href = '../home/home.html';
        } else {
            showToast(data.error || 'Invalid authentication code', 'error');
        }

    } catch (err) {
        showToast('Could not connect to server', 'error');
    }
}

// Form validation and submission
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('overlay-verify-button').addEventListener('click', verify2FACode);
    document.getElementById('overlay-cancel-button').addEventListener('click', hideTwoFactorOverlay);
    // Login form submission
    const loginForm = document.querySelector('#login form');
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            showToast('Please fill in all the fields', 'error');
            return;
        }

        const rememberMe = document.getElementById('remember-me').checked;


        try {
                const res = await fetch(API_URL + '/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ email: email, password: password, rememberMe })
                });
                const data = await res.json();

                if (res.ok && data.twoFactorRequired) {
                    pendingUserID = data.userId;
                    pendingRememberMe = rememberMe;
                    showTwoFactorOverlay();
                    showToast('The authentication code has been sent to your email!', 'info');
                } else if (res.ok && data.authenticated) {
                    saveAuthToken(data.token, rememberMe);
                    showToast('Login successful', 'success');
                    window.location.href = '../home/home.html';
                } else {
                    showToast(data.error || 'Login failed', 'error');
                }
            } catch (err) {
                showToast('Could not connect to server', 'error');
            }

    });

    
    // Signup form submission
    const signupForm = document.querySelector('#signup form');
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const enable2FA = document.getElementById('enable-2fa').checked;

        // Basic validation
        if (!name || !email || !password || !confirmPassword) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        if (!isValidPassword(password)) {
            showToast('Password must be at least 12 characters long and include uppercase letters, lowercase letters, numbers, and special characters', 'warning');
            return;
        }
        
        try {
            
            const res = await fetch(API_URL + '/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, enable2FA })
            });

            const data = await res.json();

            if (res.ok && data.authenticated) {
                saveAuthToken(data.token, false);
                showToast('Signup successful', 'success');
                window.location.href = '../home/home.html';
            } else if (res.ok && data.twoFactorRequired) {
                pendingUserID = data.userId;
                pendingRememberMe = false;
                signupForm.reset();
                showTwoFactorOverlay();
                showToast('The authentication code has been sent to your email! Please verify to complete signup.', 'info');
            } else {
                showToast(data.error || 'Sign up error, please try again', 'error');
            }
            
        } catch (err) {

            showToast('Could not connect to the server', 'error');
        }
    });
});

function isValidPassword(password) {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChars;
}
