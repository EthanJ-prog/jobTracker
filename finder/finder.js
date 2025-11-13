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
  
  // Format the created date (when added to our DB)
  const formattedCreatedDate = job.created_at ? new Date(job.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : 'N/A';
  
  // Helper function to format values with fallbacks
  const formatValue = (value, fallback = 'N/A') => {
    if (!value || value.trim() === '') return fallback;
    return value;
  };
  
  // Format remote status based on API data
  const remoteStatus = job.is_remote === 1 ? 'Remote' : 
                      job.is_remote === 0 ? 'On-site' : 'N/A';
  
  // Format employment type
  const employmentType = formatValue(job.employment_type || job.type, 'Not specified');
  
  // Format salary with currency symbol and commas
  const formatSalary = (min, max, currency) => {
    if (!min && !max) return 'Salary not available';
    
    const currencySymbols = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'CAD': 'C$',
      'AUD': 'A$'
    };
    
    const symbol = currencySymbols[currency] || '$';
    const formatNumber = (num) => num ? num.toLocaleString() : '';
    
    if (min && max) {
      return `${symbol}${formatNumber(min)} - ${symbol}${formatNumber(max)}`;
    } else if (min) {
      return `${symbol}${formatNumber(min)}+`;
    } else if (max) {
      return `Up to ${symbol}${formatNumber(max)}`;
    }
    return 'Salary not available';
  };
  
  const salaryText = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  
  // Create job card HTML structure with all details (consistent order)
  card.innerHTML = `
    <h3 class="job-title">${formatValue(job.title, 'No title available')}</h3> 
    <div class="job-details">
      <p class="job-company"><strong>Company:</strong> ${formatValue(job.company, 'Company not specified')}</p>
      <p class="job-location"><strong>Location:</strong> ${formatValue(job.location, 'No location specified')}</p>
      <p class="job-type"><strong>Type:</strong> ${employmentType}</p>
      <p class="job-remote"><strong>Remote:</strong> ${remoteStatus}</p>
      <p class="job-date"><strong>Posted:</strong> ${formattedDate}</p>
      <p class="job-added"><strong>Added to DB:</strong> ${formattedCreatedDate}</p>
      <p class="job-salary"><strong>Salary:</strong> ${salaryText}</p>
      <div class="job-description-summary"> 
        <p class="job-description-text">${job.description_summary ? `<strong>Description: </strong>${job.description_summary}` : '<em>Description summary unavailable</em>'}</p>
      </div>
    </div>
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
  
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openJobDetailOverlay(job);
  });

  if(job.description) {
    loadJobDescriptionSummary(card, job.description);
  } else {
    const descElement = card.querySelector('.job-description-text');
    if (descElement) {
      descElement.innerHTML = '<em>No description available</em>';
    }
  }

  return card;
}

  async function loadJobDescriptionSummary(card, description){
    try {
      const descElement = card.querySelector('.job-description-text');
      if(!descElement) return;

      const response = await fetch(`${API_BASE}/api/jobs/summarize-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({description: description})
      });

      if (!response.ok){
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      if (data.summary) {
        descElement.innerHTML = `<strong>Description: </strong>${data.summary}`;
      } else {
        descElement.innerHTML = '<em>Unable to generate summary</em>';
      }

    } catch (err) {
      console.error('Unable to fetch job description text: ', err);
      const descElement = card.querySelector('.job-description-text');
      if (descElement) {
        descElement.innerHTML = '<em>Description summary unavailable</em>';
      }
    }
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
  const pageCtrls = document.querySelector('.pagination-controls');
  if(pageCtrls){
    pageCtrls.style.display = 'flex';
  }

  // highlight nav link for current page
  (function setActiveNav() {
    const current = window.location.href;
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href) return;
      // simple, robust check for local and server paths
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
 * Sets up search input with debounced search functionality
 * Prevents excessive API calls while user is typing
 */
function setupSearch() {
  const searchInput = document.getElementById('search-input');
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
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

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
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

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
  const panel = document.getElementById('filter-panel');
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

            const pageCtrls = document.querySelector('.pagination-controls');
            if (pageCtrls){
              if (tabID === 'jobs'){
                pageCtrls.style.display = 'flex';
              } else {
                pageCtrls.style.display = 'none';
              }
            }
        });
    });
    initializeJobDetailOverlay();
});

function openJobDetailOverlay(job) {
  const overlay = document.getElementById('job-detail-overlay');
  
  document.getElementById('overlay-job-title').textContent = job.title || 'No title';
  document.getElementById('overlay-company').textContent = job.company || 'No company';
  document.getElementById('overlay-location').textContent = job.location || 'No location';
  document.getElementById('overlay-employment-type').textContent = job.employment_type || 'No type';
  document.getElementById('overlay-posted-date').textContent = job.posted_date ? 
    new Date(job.posted_date).toLocaleDateString() : 'No date';
  
  // Fix the "Added to DB" field
  const createdDateElement = document.getElementById('overlay-created-date');
  if (createdDateElement) {
    createdDateElement.textContent = job.created_at ? 
      new Date(job.created_at).toLocaleDateString() : 'Unknown';
  }
  
  // Always show salary container with formatted currency
  const salaryContainer = document.getElementById('overlay-salary-container');
  const salaryElement = document.getElementById('overlay-salary');
  
  // Format salary with currency symbol and commas (same as job card)
  const formatSalary = (min, max, currency) => {
    if (!min && !max) return 'Salary not available';
    
    const currencySymbols = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'CAD': 'C$',
      'AUD': 'A$'
    };
    
    const symbol = currencySymbols[currency] || '$';
    const formatNumber = (num) => num ? num.toLocaleString() : '';
    
    if (min && max) {
      return `${symbol}${formatNumber(min)} - ${symbol}${formatNumber(max)}`;
    } else if (min) {
      return `${symbol}${formatNumber(min)}+`;
    } else if (max) {
      return `Up to ${symbol}${formatNumber(max)}`;
    }
    return 'Salary not available';
  };
  
  const salaryText = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  salaryElement.textContent = salaryText;
  salaryContainer.style.display = 'block';
  
  // Always show remote container
  const remoteContainer = document.getElementById('overlay-remote-container');
  document.getElementById('overlay-remote').textContent = job.is_remote ? 'Yes' : 'No';
  remoteContainer.style.display = 'block';
  
  const desc = job.description ? 
    job.description
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim() : 'No description available';
  document.getElementById('overlay-description').innerHTML = desc.replace(/\n/g, '<br>');
  
  const applyBtn = document.getElementById('overlay-apply-button');
  if (job.apply_link) {
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply Now';
    applyBtn.onclick = () => window.open(job.apply_link, '_blank');
  } else {
    applyBtn.disabled = true;
    applyBtn.textContent = 'No Apply Link';
  }
  
  document.getElementById('overlay-save-button').onclick = async () => {
    try {
      await saveJobToTracker(job);
      closeJobDetailOverlay();
      document.querySelectorAll('.job-card').forEach(card => {
        if (card.querySelector('.job-title').textContent === job.title) card.remove();
      });
    } catch (error) {
      alert('Failed to save job. Please try again.');
    }
  };
  
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeJobDetailOverlay() {
  document.getElementById('job-detail-overlay').classList.remove('show');
  document.body.style.overflow = '';
}

function initializeJobDetailOverlay() {
  const overlay = document.getElementById('job-detail-overlay');
  const closeBtn = document.getElementById('close-overlay');
  
  closeBtn.addEventListener('click', closeJobDetailOverlay);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeJobDetailOverlay();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) {
      closeJobDetailOverlay();
    }
  });
}

