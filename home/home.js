const PF = window.Pathfinder;

function getAuthToken() {
  return PF.getAuthToken();
}

function clearAuthToken() {
  PF.clearAuthToken();
}

function showPopup(popupId) {
  PF.showPopup(popupId);
}

function hidePopups() {
  PF.hidePopups();
}

function setupPopupHandlers() {
  PF.setupPopupHandlers();
}

PF.setupAuthNav();

// API endpoint base URL
const API_URL = 'http://localhost:3000';

/**
 * Load user profile data from the server and display it
 */
async function loadUserProfile() {
  await PF.loadUserProfile(API_URL, loadUserResumes);
}

async function loadUserResumes() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/user/resumes`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      console.error('Failed to load resume history');
      return;
    }

    const data = await response.json();
    const section = document.getElementById('profile-resumes-section');
    const currentLabel = document.getElementById('profile-current-resume-label');
    const historyContainer = document.getElementById('profile-resume-history');

    if (!section || !currentLabel || !historyContainer) {
      return;
    }

    if (!data.current && (!Array.isArray(data.history) || data.history.length === 0)) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    if (data.current) {
      currentLabel.textContent = `Active resume: ${data.current.filename} (updated ${new Date(data.current.updated_at).toLocaleDateString()})`;
    } else {
      currentLabel.textContent = 'No active resume uploaded.';
    }

    if (Array.isArray(data.history) && data.history.length > 0) {
      historyContainer.innerHTML = `
        <ul class="resume-history-list">
          ${data.history.map((resume) => `
            <li>
              <strong>${resume.filename}</strong> — replaced ${new Date(resume.replaced_at).toLocaleDateString()}
            </li>
          `).join('')}
        </ul>
      `;
    } else {
      historyContainer.innerHTML = '<p>No previous resumes saved yet.</p>';
    }
  } catch (err) {
    console.error('Error loading user resumes:', err);
  }
}

/**
 * Toggle between view and edit modes for the profile
 */
function toggleProfileEditMode(isEdit) {
  PF.toggleProfileEditMode(isEdit);
}

/**
 * Save the updated profile name
 */
async function saveUserProfile() {
  await PF.saveUserProfile(API_URL, loadUserProfile);
}

/**
 * Load 2FA status from the server
 */
async function load2FAStatus() {
  await PF.load2FAStatus(API_URL);
}

/**
 * Toggle 2FA on/off
 */
async function toggle2FA(event) {
  await PF.toggle2FA(API_URL, event);
}

function escapeAdminText(value) {
  return PF.escapeHtml(value);
}

async function loadAdminPanel() {

  const token = getAuthToken();
  const adminSection = document.getElementById('admin-section');
  const usersList = document.getElementById('admin-users-list');
  const jobsList = document.getElementById('admin-jobs-list');

  if (!adminSection || !usersList || !jobsList) return;

  adminSection.setAttribute('hidden', '');

  usersList.textContent = '';
  jobsList.textContent = '';

  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/check`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;
    adminSection.removeAttribute('hidden');

    await loadAdminUsers();
    await loadAdminJobs();
  } catch (err) {
    console.error('Error loading admin panel', err);
  }
}

async function loadAdminUsers() {
  const token = getAuthToken();
  const usersList = document.getElementById('admin-users-list');

  if (!token || !usersList) return;
  usersList.textContent = 'Loading users...';

  const res = await fetch(`${API_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    usersList.textContent = 'Could not load users';
    return;
  }

  const users = await res.json();
  if (!users.length) {
    usersList.textContent = 'No users found';
    return;
  }

  usersList.innerHTML = users.map((user) => `<p>${escapeAdminText(user.name || 'No name')} - ${escapeAdminText(user.email)} <button type="button" onclick="deleteAdminUser(${user.id})">Delete</button></p>`).join('');

}

async function loadAdminJobs() {
  const token = getAuthToken();
  const jobsList = document.getElementById('admin-jobs-list');

  if (!token || !jobsList) return;

  jobsList.textContent = 'Loading jobs...';

  const res = await fetch(`${API_URL}/api/admin/jobs`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    jobsList.textContent = 'Could not load jobs';
    return;
  }

  const jobs = await res.json();
  if (!jobs.length) {
    jobsList.textContent = 'No jobs found';
    return;
  }

  jobsList.innerHTML = jobs.map((job) => `<p>${escapeAdminText(job.title)} - ${escapeAdminText(job.company)} <button type="button" onclick="deleteAdminJob(${job.id})">Delete</button></p>`).join('');
}

async function deleteAdminUser(userId) {
  const token = getAuthToken();

  if (!token) return;
  if (!confirm('Delete this user and their save data?')) return;
  const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    alert('Could not delete user');
    return;
  }

  await loadAdminUsers();
}

async function deleteAdminJob(jobId) {
  const token = getAuthToken();

  if (!token) return;
  if (!confirm('Delete this job listing?')) return;
  const res = await fetch(`${API_URL}/api/admin/jobs/${jobId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    alert('Could not delete job');
    return;
  }

  await loadAdminJobs();
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

document.addEventListener('DOMContentLoaded', function() {
  const deleteBtn = document.getElementById('profile-delete-btn');

  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteUserAccount);
  }

  PF.setupProfileSettings({
    baseUrl: API_URL,
    loadProfile: loadUserProfile,
    saveProfile: saveUserProfile,
    loadSettings: async () => {
      await load2FAStatus();
      await loadAdminPanel();
    },
    toggleTwoFactor: toggle2FA
  });
});
