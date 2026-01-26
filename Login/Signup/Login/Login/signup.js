// Tab switching functionality
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));

    // Show the selected tab content
    document.getElementById(tabName).classList.add('active');

    // Add active class to the clicked button
    event.target.classList.add('active');
}

// Toast notification system
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

// Toggle 2FA code input visibility
function toggle2FA() {
    const checkbox = document.getElementById('enable-2fa');
    const codeDiv = document.getElementById('2fa-code');

    if (checkbox.checked) {
        codeDiv.style.display = 'block';
    } else {
        codeDiv.style.display = 'none';
    }
}

// Form validation and submission
document.addEventListener('DOMContentLoaded', function() {
    // Login form submission
    const loginForm = document.querySelector('#login form');
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (email && password) {
            showToast('Login successful! Welcome back!', 'success');
            //Send data to backend here
        } else {
            showToast('Please fill in all fields', 'error');
        }
    });

    // Signup form submission
    const signupForm = document.querySelector('#signup form');
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const enable2FA = document.getElementById('enable-2fa').checked;

        // Basic validation
        if (!email || !password || !confirmPassword) {
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

        if (enable2FA) {
            const verificationCode = document.getElementById('verification-code').value;
            if (!verificationCode || verificationCode.length !== 6) {
                showToast('Please enter a valid 6-digit verification code', 'error');
                return;
            }
        }

        showToast('Sign up successful! Welcome to our platform!', 'success');
        //Send data to backend here
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
