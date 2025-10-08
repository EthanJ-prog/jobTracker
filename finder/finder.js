// Global state variables for job management
let allJobs = [];

// API configuration constants
const API_BASE = 'http://localhost:3000';
const PAGE_SIZE = 8; // Number of jobs to display per page
const REQUEST_SIZE = PAGE_SIZE * 2; // Request more jobs to account for saved jobs filtering

// Pagination and search state
let currentPage = 1;
let lastPageCount = 0;
let currentQuery = '';
let totalJobsCount = null;

/**
 * Fetches jobs from the API with search and pagination
 * Filters out jobs that are already saved to avoid duplicates
 * @param {string} query - Search query string
 * @param {number} page - Page number for pagination
 */
async function fetchJobs(query = '', page = 1) {
  showLoadingMessage();
  try {
    // Build API query parameters
    const queryParam = query 
      ? `?q=${encodeURIComponent(query)}&limit=${REQUEST_SIZE}&offset=${(page-1)*PAGE_SIZE}` 
      : `?limit=${REQUEST_SIZE}&offset=${(page-1)*PAGE_SIZE}`;

    // Fetch jobs from API
    const response = await fetch(`${API_BASE}/api/jobs${queryParam}`);
    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    const allJobsFromAPI = Array.isArray(data.jobs) ? data.jobs : [];

    // Get saved jobs to filter out duplicates
    const savedJobs = await getSavedJobs();
    const unsavedJobs = allJobsFromAPI.filter(job => {
      return !savedJobs.some(savedJob => 
        savedJob.title === job.title && 
        savedJob.company === job.company
      );
    });

    // Display only the requested page size
    const toDisplay = unsavedJobs.slice(0, PAGE_SIZE);
    allJobs = toDisplay;
    displayJobs(toDisplay);

    // Update pagination state
    currentPage = page;
    currentQuery = query;
    lastPageCount = toDisplay.length;
    updatePaginationControls();
    updateDbCountLabel(query);
    console.log(`loaded ${allJobsFromAPI.length} jobs, showing ${unsavedJobs.length} unsaved jobs for query: ${query || '(all)'}`);
  } catch (error) {
    console.error('Failed to load job:', error);
    showErrorMessage(error.message);
  }
}

/**
 * Displays job cards in the job listings container
 * Shows appropriate message if no jobs are found
 * @param {Array} jobs - Array of job objects to display
 */
function displayJobs(jobs) {
  const container = document.querySelector('.job-listings-container');
  container.innerHTML = '';

  // Show no jobs message if empty
  if (jobs.length === 0) {
    container.innerHTML = `
      <div class="no-jobs-message"> 
        <h3>No jobs found</h3>
        <p>Try adjusting your search or filters</p>
      </div>
    `;
    return;
  }

  // Create and append job cards
  jobs.forEach(job => {
    const jobCard = createJobCard(job);
    container.appendChild(jobCard);
  });
}

/**
 * Creates a job card DOM element with job details and interactive buttons
 * @param {Object} job - Job object containing job details
 * @returns {HTMLElement} - Job card DOM element
 */
function createJobCard(job) {
  const card = document.createElement('div');
  card.className = 'job-card';

  // Format the posted date for display
  const formattedDate = job.posted_date ? new Date(job.posted_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : '';
  
  // Create job card HTML structure
  card.innerHTML = `
    <h3 class="job-title">${job.title || ''}</h3> 
    <p class="job-company">${job.company || ''}</p>
    <p class="job-location">${job.location || ''}</p>
    <p class="job-type">${job.employment_type || job.type || ''}</p>
    <p class="job-date">${formattedDate}</p>
    <button class="apply-button" ${job.apply_link ? '' : 'disabled'}> Apply </button>
    <button type="button" class="star-button">&#9734;</button>
  `;

  // Add apply button functionality
  const applyButton = card.querySelector('.apply-button');
  if (job.apply_link) {
    applyButton.addEventListener('click', () => {
      window.open(job.apply_link, '_blank');
    });
  }

  // Add star button functionality for saving jobs
  const starButton = card.querySelector('.star-button');
  
  starButton.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Save job to tracker and remove from finder
    await saveJobToTracker(job);
    card.remove();
    
    console.log('Job saved and removed from finder:', job.title);
  });
  
  return card;
}

/**
 * Displays error message in the job listings container
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
  const container = document.querySelector('.job-listings-container');
  container.innerHTML = `
    <div class="error-message">
      <h3>Oops, something went wrong</h3>
      <p>${message}</p>
      <button onclick="fetchJobs()">Try Again</button>
    </div>
  `;
}

/**
 * Displays loading message while fetching jobs
 */
function showLoadingMessage() {
  const container = document.querySelector('.job-listings-container');
  container.innerHTML = `
    <div class="loading-message">
      <h3>Loading jobs...</h3>
      <p>Please wait while we fetch the latest job listings.</p>
    </div>
  `;
}

/**
 * Fetches saved jobs from the tracker to filter out duplicates
 * @returns {Array} - Array of saved job objects
 */
async function getSavedJobs() {
  try {
    const response = await fetch(`${API_BASE}/jobs`);
    const jobs = await response.json();
    return jobs.filter(job => job.status === 'saved');
  } catch (error) {
    console.error('Failed to get saved jobs:', error);
    return [];
  }
}

/**
 * Saves a job to the tracker database
 * @param {Object} job - Job object to save
 */
async function saveJobToTracker(job) {
  const jobData = {
    title: job.title || '',
    company: job.company || '',
    date: job.posted_date ? new Date(job.posted_date).toISOString().split('T')[0] : '',
    link: job.apply_link || '',
    notes: `Found via Job Finder - ${job.location || ''} - ${job.employment_type || ''}`,
    status: 'saved'
  };

  await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData)
  });
}

// Initialize the job finder when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("Loaded job finder");
  setupSearch();
  wirePaginationButtons();
  updateDbCountLabel('');
  fetchJobs('');
});

/**
 * Sets up search input with debounced search functionality
 * Prevents excessive API calls while user is typing
 */
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const debounced = debounce((term) => {
    fetchJobs(term, 1);
  }, 400);

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    const trimmed = searchTerm.trim();
    if (trimmed.length === 0) {
      fetchJobs('', 1);
    } else {
      debounced(trimmed);
    }
  });
}

/**
 * Updates pagination controls based on current state
 * Enables/disables buttons and updates page information display
 */
function updatePaginationControls() {
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  if (!prevBtn || !nextBtn || !pageInfo) return;

  // Calculate display range
  const startIndex = (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex = startIndex + lastPageCount - 1;

  const rangeText = `${startIndex}\u2013${Math.max(startIndex, endIndex)}`;

  // Update page info with range and total count
  pageInfo.innerHTML = (typeof totalJobsCount === 'number')
    ? `<span class="page-range">${rangeText}</span> / <span class="page-total">${totalJobsCount}</span>`
    : `<span class="page-range">${rangeText}</span>`;

  // Enable/disable pagination buttons
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = lastPageCount < PAGE_SIZE;
}

/**
 * Updates the total job count from the database
 * Used for pagination display
 * @param {string} query - Search query to get count for
 */
async function updateDbCountLabel(query) {
  try {
    const queryParam = query ? `?q=${encodeURIComponent(query)}` : '';
    const response = await fetch(`${API_BASE}/api/jobs/count${queryParam}`);
    if (!response.ok) return;

    const data = await response.json();

    if (typeof data.total === 'number') {
      totalJobsCount = data.total;
      updatePaginationControls();
    }
  } catch (e) {
    // Silently handle errors for count updates
  }
}

/**
 * Sets up event listeners for pagination buttons
 * Handles previous and next page navigation
 */
function wirePaginationButtons() {
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        fetchJobs(currentQuery, currentPage - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      fetchJobs(currentQuery, currentPage + 1);
    });
  }
}

/**
 * Toggles the visibility of the filter panel
 */
function toggleFilters() {
  const panel = document.getElementById('filterPanel');
  panel.style.display = (panel.style.display === 'flex') ? 'none' : 'flex';
}

/**
 * Creates a debounced version of a function to limit execution frequency
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Mobile navigation functionality
const hamburgerBtn = document.getElementById('hamburgerToggle');
const navBar = document.getElementById('nav-bar');

// Toggle mobile navigation menu
hamburgerBtn.addEventListener('click', () => {
    navBar.classList.toggle('is-active');
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!navBar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        navBar.classList.remove('is-active');
    }
});

// Close mobile menu with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        navBar.classList.remove('is-active');
    }
});

// Tab navigation functionality
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs and panes
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding pane
            button.classList.add('active');
            
            const tabID = button.dataset.tab;
            document.getElementById(`${tabID}-tab`).classList.add('active');
        });
    });
});

