// API configuration for backend communication
const API_BASE = "http://localhost:3000";

let trackerJobs = [];
let trackerFilters = {
  query: '',
  status: '',
  job_type: '',
  location: '',
  salary_min: '',
  posted_date: '',
  is_remote: false
};

// Resolve a job field by checking a list of possible property names.
function getJobField(job, fieldNames) {
  for (const name of fieldNames) {
    if (job && Object.prototype.hasOwnProperty.call(job, name) && job[name] != null) {
      return job[name];
    }
  }
  return '';
}

// Normalize salary values so numeric filters can be compared reliably.
function parseSalaryValue(value) {
  if (value === undefined || value === null || value === '') {
    return NaN;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return NaN;
  }
  const parsed = parseFloat(value.toString().replace(/[^0-9\.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

// Determine whether a single job should appear in the current filtered view.
function isJobMatchFilters(job) {
  const query = trackerFilters.query.trim().toLowerCase();
  const statusFilter = trackerFilters.status;
  const jobTypeFilter = trackerFilters.job_type;
  const locationFilter = trackerFilters.location.trim().toLowerCase();
  const salaryFilter = parseSalaryValue(trackerFilters.salary_min);
  const postedDateFilter = trackerFilters.posted_date;
  const remoteOnly = trackerFilters.is_remote;

  if (statusFilter && String(job.status || '').toLowerCase() !== statusFilter.toLowerCase()) {
    return false;
  }

  if (jobTypeFilter) {
    const normalizedJobTypeFilter = jobTypeFilter.toLowerCase().replace('_', '-');
    const jobType = String(getJobField(job, ['employment_type', 'job_type', 'jobType', 'type'])).toLowerCase();
    if (!jobType.includes(normalizedJobTypeFilter)) {
      return false;
    }
  }

  if (locationFilter) {
    const location = String(getJobField(job, ['location', 'city', 'region'])).toLowerCase();
    if (!location.includes(locationFilter)) {
      return false;
    }
  }

  if (!Number.isNaN(salaryFilter)) {
    const salaryValue = parseSalaryValue(getJobField(job, ['salary', 'salary_min', 'salary_range']));
    if (Number.isNaN(salaryValue) || salaryValue < salaryFilter) {
      return false;
    }
  }

  if (postedDateFilter) {
    const postedDate = new Date(getJobField(job, ['posted_date', 'date_posted', 'date']));
    if (!postedDate || Number.isNaN(postedDate.getTime())) {
      return false;
    }
    const now = Date.now();
    const cutoffMap = {
      '24H': 24 * 60 * 60 * 1000,
      '7D': 7 * 24 * 60 * 60 * 1000,
      '30D': 30 * 24 * 60 * 60 * 1000
    };
    const cutoff = cutoffMap[postedDateFilter] || 0;
    if (cutoff > 0 && now - postedDate.getTime() > cutoff) {
      return false;
    }
  }

  if (remoteOnly) {
    const remoteValue = getJobField(job, ['is_remote', 'remote', 'remote_option', 'work_from_home']);
    if (!remoteValue || String(remoteValue).toLowerCase() === 'false') {
      return false;
    }
  }

  if (query) {
    const text = [
      job.title,
      job.company,
      job.notes,
      job.link,
      getJobField(job, ['location', 'city', 'region']),
      job.status,
      getJobField(job, ['employment_type', 'job_type', 'jobType', 'type'])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!text.includes(query)) {
      return false;
    }
  }

  return true;
}

// Return only the jobs that satisfy the currently active tracker filters.
function getFilteredTrackerJobs() {
  return trackerJobs.filter(isJobMatchFilters);
}

// Rebuild the visible job cards for each tracker column from the supplied job list.
function renderTrackerColumns(jobs) {
  document.querySelectorAll('.column').forEach(column => {
    const content = column.querySelector('.column-content');
    if (!content) return;
    content.querySelectorAll('.job-card').forEach(card => card.remove());
  });

  jobs.forEach(job => {
    const targetColumn = document.getElementById(job.status || 'saved');
    if (!targetColumn) return;
    const content = targetColumn.querySelector('.column-content');
    if (!content) return;
    const jobCard = createJobCard(job);
    const insertBefore = content.querySelector('.input-wrapper');
    if (insertBefore) {
      content.insertBefore(jobCard, insertBefore);
    } else {
      content.appendChild(jobCard);
    }
  });
}

// Re-render the tracker using the latest filter state.
function applyTrackerFilters() {
  const filtered = getFilteredTrackerJobs();
  renderTrackerColumns(filtered);
  return filtered;
}

// Reset all tracker filters and refresh the displayed jobs.
function clearTrackerFilters() {
  trackerFilters = {
    query: '',
    status: '',
    job_type: '',
    location: '',
    salary_min: '',
    posted_date: '',
    is_remote: false
  };
  document.getElementById('tracker-search-input').value = '';
  document.getElementById('tracker-column-filter').value = '';
  document.getElementById('tracker-jobtype-filter').value = '';
  document.getElementById('tracker-location-filter').value = '';
  document.getElementById('tracker-salary-filter').value = '';
  document.getElementById('tracker-date-posted-filter').value = '';
  document.getElementById('tracker-remote-filter').checked = false;
  applyTrackerFilters();
}

// Bind the tracker filter inputs to the filter state and re-rendering logic.
function setupTrackerFilters() {
  const queryInput = document.getElementById('tracker-search-input');
  const columnSelect = document.getElementById('tracker-column-filter');
  const jobTypeSelect = document.getElementById('tracker-jobtype-filter');
  const locationInput = document.getElementById('tracker-location-filter');
  const salaryInput = document.getElementById('tracker-salary-filter');
  const dateSelect = document.getElementById('tracker-date-posted-filter');
  const remoteCheckbox = document.getElementById('tracker-remote-filter');
  const clearFiltersButton = document.getElementById('tracker-clear-filters');

  if (!queryInput || !columnSelect || !jobTypeSelect || !locationInput || !salaryInput || !dateSelect || !remoteCheckbox || !clearFiltersButton) {
    return;
  }

  const updateFilters = () => {
    trackerFilters.query = queryInput.value;
    trackerFilters.status = columnSelect.value;
    trackerFilters.job_type = jobTypeSelect.value;
    trackerFilters.location = locationInput.value;
    trackerFilters.salary_min = salaryInput.value;
    trackerFilters.posted_date = dateSelect.value;
    trackerFilters.is_remote = remoteCheckbox.checked;
    applyTrackerFilters();
  };

  queryInput.addEventListener('input', updateFilters);
  columnSelect.addEventListener('change', updateFilters);
  jobTypeSelect.addEventListener('change', updateFilters);
  locationInput.addEventListener('input', updateFilters);
  salaryInput.addEventListener('input', updateFilters);
  dateSelect.addEventListener('change', updateFilters);
  remoteCheckbox.addEventListener('change', updateFilters);
  clearFiltersButton.addEventListener('click', clearTrackerFilters);
}

/**
 * Return the current auth token from storage (localStorage preferred).
 * @returns {string|null}
 */
function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Remove authentication tokens from storage. Use when signing out
 * or if the backend indicates the session is invalid.
 */
function clearAuthToken() {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
}

/**
 * Show a popup by id and reveal the backdrop. Hides other popups
 * and ensures the document body receives the modal-open class.
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
 * Hide all popup overlays and remove the backdrop.
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

// Attach handlers to popup close elements and escape/backdrop actions.
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

/**
 * Generic API call function for making HTTP requests to the backend
 * @param {string} endpoint - The API endpoint to call
 * @param {Object} options - Additional fetch options (method, body, etc.)
 * @returns {Promise<Object>} - Parsed JSON response from the API
 */
async function apiCall(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers["Authorization"] = 'Bearer ' + token;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options, 
    headers: { ...headers, ...(options.headers || {})}
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

// Initialize the tracker view once the page DOM is ready.
window.addEventListener('DOMContentLoaded', async () => {
  try {
    setupAuthNav();

    const token = getAuthToken();

    if (!token) {
      window.location.href = '../auth/signup.html';
      return;
    }

    // Fetch all jobs from the API
    const jobs = await apiCall('/jobs');
    trackerJobs = Array.isArray(jobs) ? jobs : [];
    console.log('Jobs loaded from the server:', trackerJobs);

    if (trackerJobs.length > 0) {
      renderTrackerColumns(trackerJobs);
    } else {
      console.log('No jobs found in the database');
    }
    setupTrackerFilters();
  } catch (error) {
    console.error('Failed to load jobs from the server:', error);
    alert('Failed to load jobs from the server, please refresh your page');
  }

  // highlight nav link for current page
  (function setActiveNav() {
    const current = window.location.href;
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href) return;
      if ((current.includes('finder.html') && href.includes('finder.html')) ||
          (current.includes('tracker.html') && href.includes('tracker.html'))) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  })();

});

/**
 * Setup authentication-related navigation elements in the header
 * (login link visibility, user menu, sign out handler, and popup links).
 */
function setupAuthNav() {
  const token = getAuthToken();
  const loginLink = document.getElementById('nav-login'); 
  const userWrap = document.getElementById('nav-user-wrap');
  const signOutButton = document.getElementById('nav-signout');
  const profileLink = document.getElementById('nav-profile');
  const settingsLink = document.getElementById('nav-settings');
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
}



// Global variable to track the currently dragged job and its source column
let draggedJob = { job: null, sourceColumnId: '' };

/**
 * Creates a job card DOM element with job details and interactive buttons
 * @param {Object} job - Job object containing job details
 * @returns {HTMLElement} - Job card DOM element
 */
function createJobCard(job) {

  // Create the main job card container
  const card = document.createElement('div');
  card.className = 'job-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-job-id', job.id);

  // Create job title span
  const titleSpan = document.createElement('span');
  titleSpan.className = 'job-title';
  titleSpan.textContent = job.title;
  card.appendChild(titleSpan);

  // Create display div with job details
  const displayDiv = document.createElement('div');
  displayDiv.className = 'job-details';
  const dateLabel = job.status === 'saved' ? 'Date Saved:' : 'Date Applied:';
  displayDiv.innerHTML = `
    <div><strong>Company:</strong> ${job.company || ''}</div>
    <div><strong>${dateLabel}</strong> ${job.date || ''}</div>
    <div><strong>Job Link:</strong> <a href="${job.link || '#'}" target="_blank" class="job-link">${job.link ? 'View Job Posting' : 'No link'}</a></div>
    <div><strong>Notes:</strong> ${job.notes || ''}</div>
  `;

  // Create edit form div (hidden by default)
  const editDiv = document.createElement('div');
  editDiv.className = 'job-details';
  editDiv.style.display = 'none';
  editDiv.innerHTML = `
    <label><strong>Position:</strong><br><input type="text" class="edit-title" value="${job.title || ''}" /></label><br>
    <label><strong>Company:</strong><br><input type="text" class="edit-company" value="${job.company || ''}" /></label><br>
    <label><strong>Applied:</strong><br><input type="date" class="edit-date" value="${job.date || ''}" /></label><br>
    <label><strong>Link:</strong><br><input type="url" class="edit-link" value="${job.link || ''}" /></label><br>
    <label><strong>Notes:</strong><br><textarea class="edit-notes">${job.notes || ''}</textarea></label><br>
    <button class="update-button">Update</button>
    <button class="cancel-button">Cancel</button>
  `;

  // Create edit button and add click handler
  const editButton = document.createElement('button');
  editButton.textContent = 'Edit';
  editButton.className = 'edit-button';
  editButton.addEventListener('click', (e) => {
    e.stopPropagation();
    displayDiv.style.display = 'none';
    editDiv.style.display = 'block';
  });
  displayDiv.appendChild(editButton);

  // Append display and edit divs to the card
  card.appendChild(displayDiv);
  card.appendChild(editDiv);

  // Prevent card click when clicking buttons
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
  });

  // Create delete button with confirmation
  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-button';
  deleteButton.textContent = 'X';
  deleteButton.addEventListener('click', async () => {
    try {
     await apiCall(`/jobs/${job.id}`, {
      method: 'DELETE'
     });
     card.remove();
     if (job.status === 'saved'){
      localStorage.setItem('finderCountNeedsUpdate', 'true');
     }
     trackerJobs = trackerJobs.filter(item => item.id !== job.id);
     applyTrackerFilters();
     console.log(`${job.id} was successfully deleted`);
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert('Failed to delete job, please try again');
    }
  });
  card.appendChild(deleteButton);

  // Add update button functionality
  card.querySelector('.update-button').addEventListener('click', async () => {
    try {
      // Collect updated values from form inputs
      const updatedValues = {
        title: editDiv.querySelector('.edit-title').value.trim(),
        company: editDiv.querySelector('.edit-company').value.trim(),
        date: editDiv.querySelector('.edit-date').value.trim(),
        link: editDiv.querySelector('.edit-link').value.trim(),
        notes: editDiv.querySelector('.edit-notes').value.trim(),
        status: job.status
      };
      
      // Send update to API
      await apiCall(`/jobs/${job.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedValues)
      });
      
      // Update local job object and UI
      Object.assign(job, updatedValues);
      const existingTrackerJob = trackerJobs.find(item => item.id === job.id);
      if (existingTrackerJob) {
        Object.assign(existingTrackerJob, updatedValues);
      }
      titleSpan.textContent = job.title;
      const dateLabel = job.status === 'saved' ? 'Date Saved:' : 'Date Applied:';
      displayDiv.innerHTML = `
        <div><strong>Company:</strong> ${job.company || ''}</div>
        <div><strong>${dateLabel}</strong> ${job.date || ''}</div>
        <div><strong>Job Link:</strong> <a href="${job.link || '#'}" target="_blank" class="job-link">${job.link ? 'View Job Posting' : 'No link'}</a></div>
        <div><strong>Notes:</strong> ${job.notes || ''}</div>
      `;
      
      // Recreate edit button and switch back to display mode
      const newEditButton = document.createElement('button');
      newEditButton.textContent = 'Edit';
      newEditButton.className = 'edit-button';
      newEditButton.addEventListener('click', (e) => {
        e.stopPropagation();
        displayDiv.style.display = 'none';
        editDiv.style.display = 'block';
      });
      displayDiv.appendChild(newEditButton);
      editDiv.style.display = 'none';
      displayDiv.style.display = 'block';
      console.log(`${job.id} updated successfully`);
    } catch (error) {
      console.error('Failed to update job:', error);
      alert('Failed to update job, please try again');
    }
  });

  // Add cancel button functionality to restore original values
  card.querySelector('.cancel-button').addEventListener('click', () => {
    editDiv.querySelector('.edit-title').value = job.title || '';
    editDiv.querySelector('.edit-company').value = job.company || '';
    editDiv.querySelector('.edit-date').value = job.date || '';
    editDiv.querySelector('.edit-link').value = job.link || '';
    editDiv.querySelector('.edit-notes').value = job.notes || '';
    editDiv.style.display = 'none';
    displayDiv.style.display = 'block';
  });

  // Add drag start event listener to track dragged job
  card.addEventListener('dragstart', () => {
    draggedJob.job = job;
    draggedJob.sourceColumnId = card.closest('.column').id;
  });

  return card;
}

// Set up drag-and-drop functionality for all column containers.
// Handles dragenter/leave visuals, drop validation, and server-side
// updates to job status when a card is moved between columns.
document.querySelectorAll('.column').forEach(column => {
  // Handle drag over events to allow dropping
  const container = column.querySelector('.column-content');

  column.addEventListener('dragover', event => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.add('drag-over');
  });

  // Remove drag over styling when leaving drop zone
  column.addEventListener('dragleave', (event) => {
    if (!column.contains(event.relatedTarget)){
      container.classList.remove('drag-over');
    }
  });

  // Handle drop events to move jobs between columns
  column.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    container.classList.remove('drag-over');
    const targetColumn = column;
    const targetColumnId = targetColumn.id;

    // Validate drop operation
    if (!draggedJob.job) return;
    if (draggedJob.sourceColumnId == targetColumnId) return;

    try {
      // Update job status in database
      await apiCall(`/jobs/${draggedJob.job.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draggedJob.job,
          status: targetColumnId
        })
      });

      // Update local job object
      draggedJob.job.status = targetColumnId;      const existingTrackerJob = trackerJobs.find(item => item.id === draggedJob.job.id);
      if (existingTrackerJob) {
        existingTrackerJob.status = targetColumnId;
      }
      // Create new job card in target column
      const newJobCard = createJobCard(draggedJob.job);
      container.insertBefore(newJobCard, container.querySelector('.input-wrapper'));

      // Remove old job card from source column
      const sourceColumn = document.getElementById(draggedJob.sourceColumnId);
      const cards = sourceColumn.querySelectorAll('.job-card');
      for (let card of cards) {
        if (card.getAttribute('data-job-id') == draggedJob.job.id){
          card.remove();
          break;
        }
      }

      console.log(`${draggedJob.job.id} moved from ${draggedJob.sourceColumnId} to ${targetColumnId}`);
    } catch (error) {
      console.error('Failed to update job status:', error);
      alert('Failed to move job');
    }

    // Reset dragged job state
    draggedJob = { job: null, sourceColumnId: '' };
  });
});

// Toggle the add-job form for each column when its Add/Cancel button is clicked.
document.querySelectorAll('.add-button').forEach(button => {
  button.addEventListener('click', () => {
    const wrapper = button.previousElementSibling.querySelector('.input-wrapper');
    const isHidden = wrapper.style.display === 'none' || wrapper.style.display === '';

    // Toggle form visibility and button text
    if (isHidden) {
      wrapper.style.display = 'flex';
      button.textContent = 'Cancel';
    } else {
      wrapper.style.display = 'none';
      button.textContent = 'Add Job';
    }
  });
});

// Handle creating new job records via the submit buttons in each column.
// Performs validation, posts to the API, and inserts the created card.
document.querySelectorAll('.submit-button').forEach(button => {
  button.addEventListener('click', async () => {
    const columnId = button.getAttribute('data-column');
    const inputWrapper = button.parentElement;

    // Collect form data
    const title = inputWrapper.querySelector('.job-title').value.trim();
    const company = inputWrapper.querySelector('.company-name').value.trim();
    const date = inputWrapper.querySelector('.date-applied').value.trim();
    const link = inputWrapper.querySelector('.job-link').value.trim();
    const notes = inputWrapper.querySelector('.job-notes')?.value.trim() || '';

    // Validate required fields
    if (title === '') return;

    const jobData = {title, company, date, link, notes, status: columnId};

    try {
      // Create new job via API
      const response = await apiCall('/jobs', {
        method: 'POST',
        body: JSON.stringify(jobData)
      });
      
      // Create complete job object with ID
      const completeJob = {
        id: response.id,
        title: jobData.title,
        company: jobData.company,
        date: jobData.date,
        link: jobData.link,
        notes: jobData.notes,
        status: jobData.status
      }
      
      trackerJobs.push(completeJob);
      renderTrackerColumns(getFilteredTrackerJobs());

      // Clear form and hide it
      inputWrapper.querySelector('.job-title').value = '';
      inputWrapper.querySelector('.company-name').value = '';
      inputWrapper.querySelector('.date-applied').value = '';
      inputWrapper.querySelector('.job-link').value = '';
      if (inputWrapper.querySelector('.job-notes')) {
        inputWrapper.querySelector('.job-notes').value = '';
      }
      button.parentElement.style.display = 'none';

      // Reset add button text
      const addButton = column.querySelector('.add-button');
      addButton.textContent = 'Add Job';
    } catch (error) {
      console.error('Failed to create job:', error);
      alert('Failed to create job card, please try again');
    }

  });
});

// ===== Profile Management =====

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

    await loadUserResumes();

  } catch (error) {
    console.error('Error loading profile:', error);
  }
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
 * Setup profile popup event handlers
 */
document.addEventListener('DOMContentLoaded', function() {
  const editBtn = document.getElementById('profile-edit-btn');
  const saveBtn = document.getElementById('profile-save-btn');
  const cancelBtn = document.getElementById('profile-cancel-btn');

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
