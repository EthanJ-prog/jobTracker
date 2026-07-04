// Shared utilities and API configuration.
const PF = window.Pathfinder;
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

  // Toggle the collapsible advanced-filters panel (animated slide down/up).
  const filtersToggle = document.getElementById('tracker-filters-toggle');
  const filtersPanel = document.getElementById('tracker-filters-panel');
  if (filtersToggle && filtersPanel) {
    filtersToggle.addEventListener('click', () => {
      const isOpen = filtersPanel.classList.toggle('is-open');
      filtersToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
}

/**
 * Return the current auth token from storage (localStorage preferred).
 * @returns {string|null}
 */
function getAuthToken() {
  return PF.getAuthToken();
}

/**
 * Remove authentication tokens from storage. Use when signing out
 * or if the backend indicates the session is invalid.
 */
function clearAuthToken() {
  PF.clearAuthToken();
}

/**
 * Show a popup by id and reveal the backdrop. Hides other popups
 * and ensures the document body receives the modal-open class.
 */
function showPopup(popupId) {
  PF.showPopup(popupId);
}

/**
 * Hide all popup overlays and remove the backdrop.
 */
function hidePopups() {
  PF.hidePopups();
}

// Attach handlers to popup close elements and escape/backdrop actions.
function setupPopupHandlers() {
  PF.setupPopupHandlers();
}

/**
 * Generic API call function for making HTTP requests to the backend
 * @param {string} endpoint - The API endpoint to call
 * @param {Object} options - Additional fetch options (method, body, etc.)
 * @returns {Promise<Object>} - Parsed JSON response from the API
 */
async function apiCall(endpoint, options = {}) {
  return PF.apiJson(API_BASE, endpoint, options);
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
    // An expired session already redirected to login; don't show the refresh alert.
    if (error && error.message === 'SESSION_EXPIRED') return;
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
  PF.setupAuthNav();
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

const API_URL = API_BASE;

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

async function toggle2FA(event) {
  await PF.toggle2FA(API_URL, event);
}

document.addEventListener('DOMContentLoaded', function() {
  PF.setupProfileSettings({
    baseUrl: API_URL,
    loadProfile: loadUserProfile,
    saveProfile: saveUserProfile,
    loadSettings: load2FAStatus,
    toggleTwoFactor: toggle2FA
  });
});
