// Global state variables for job management
let allJobs = [];

// API configuration constants
const API_BASE = 'http://localhost:3000';
const PAGE_SIZE = 8; // Number of jobs to display per page
const REQUEST_SIZE = PAGE_SIZE * 5; // Request 5x more jobs to account for saved jobs filtering (40 jobs)

// Pagination and search state
let currentPage = 1;
let lastPageCount = 0;
let currentQuery = '';
let totalJobsCount = null;
let isSavingJob = false; // Flag to prevent refetch during save operation
let preventCountRefetch = false; // Flag to prevent count refetch after manual save
let currentFilters = {
  employment_type: '',
  is_remote: false,
  location: '',
  salary_min: '',
  posted_date: ''
};

let matchScore = {};
let hasResume = false;

async function fetchMatchScores() {
  try{
    const response = await fetch(`${API_BASE}/api/matches`);

    if (!response.ok) {
      console.error('Failed to fetch match scores');
      return;
    }

    const data = await response.json();

    hasResume = data.hasResume;
    matchScore = data.matches || {};
    console.log(`Loaded ${Object.keys(matchScore).length} match scores, has resume: ${hasResume}`);

  } catch (err) {
    console.error('Error fetching match scores: ', err);
  }
}

function getMatchScoreColor(score) {
  if (score >= 80) return 'rgb(0, 255, 0)';
  if (score >= 60) return 'rgb(250, 250, 0)';
  if (score >= 40) return '#ff0000';
  return '#ff0000';
}

/**
 * Fetches jobs from the API with search and pagination
 * Filters out jobs that are already saved to avoid duplicates
 * Uses a smart fetching strategy to ensure all jobs are accessible even after saving
 * @param {string} query - Search query string
 * @param {number} page - Page number for pagination
 */
async function fetchJobs(query = '', page = 1, filters = null) {
  const activeFilters = filters || currentFilters;
  showLoadingMessage();
  try {
    // Get saved jobs first to know what to filter
    const savedJobs = await getSavedJobs();
    console.log(`Fetching page ${page}, saved jobs count: ${savedJobs.length}`);
    
    // Calculate how many unsaved jobs we need to skip to get to the current page
    const targetOffset = (page - 1) * PAGE_SIZE;
    let allUnsavedJobs = [];
    let databaseOffset = 0;
    const maxFetchAttempts = 20; // Increased safety limit
    let fetchAttempts = 0;
    let hasMoreData = true;
    
    // Keep fetching batches until we have enough unsaved jobs for the current page OR we've exhausted the database
    while ((allUnsavedJobs.length < targetOffset + PAGE_SIZE) && hasMoreData && fetchAttempts < maxFetchAttempts) {
      fetchAttempts++;
      
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      params.append('limit', REQUEST_SIZE);
      params.append('offset', databaseOffset);

      if (activeFilters.employment_type) params.append('employment_type', activeFilters.employment_type);

      if (activeFilters.is_remote) params.append('is_remote', activeFilters.is_remote);

      if (activeFilters.location) params.append('location', activeFilters.location);

      if (activeFilters.salary_min) params.append('salary_min', activeFilters.salary_min);

      if (activeFilters.posted_date) params.append('posted_date', activeFilters.posted_date);

      // // Build API query parameters - fetch a batch starting from current database offset
      // const queryParam = query 
      //   ? `?q=${encodeURIComponent(query)}&limit=${REQUEST_SIZE}&offset=${databaseOffset}` 
      //   : `?limit=${REQUEST_SIZE}&offset=${databaseOffset}`;
      
      console.log(`Fetch attempt ${fetchAttempts}: offset=${databaseOffset}, limit=${REQUEST_SIZE}`);

      const queryParam = params.toString() ? `?${params.toString()}` : '';

      

      // Fetch jobs from API
      const response = await fetch(`${API_BASE}/api/jobs${queryParam}`);
      if (!response.ok) {
        throw new Error(`API error ${response.status}`);
      }

      const data = await response.json();
      const batchJobs = Array.isArray(data.jobs) ? data.jobs : [];
      console.log(`  Received ${batchJobs.length} jobs from database`);
      
      // If we got no jobs, we've reached the end
      if (batchJobs.length === 0) {
        console.log('  No more jobs in database, stopping');
        hasMoreData = false;
        break;
      }
      
      // Filter out saved jobs from this batch
      // Use case-insensitive comparison and trim whitespace for better matching
      const unsavedBatch = batchJobs.filter(job => {
        const jobTitle = (job.title || '').trim().toLowerCase();
        const jobCompany = (job.company || '').trim().toLowerCase();
        
        const isSaved = savedJobs.some(savedJob => {
          const savedTitle = (savedJob.title || '').trim().toLowerCase();
          const savedCompany = (savedJob.company || '').trim().toLowerCase();
          return savedTitle === jobTitle && savedCompany === jobCompany;
        });
        
        return !isSaved;
      });
      
      console.log(`  After filtering saved jobs: ${unsavedBatch.length} unsaved jobs in this batch`);
      
      // Add unsaved jobs to our collection
      allUnsavedJobs = allUnsavedJobs.concat(unsavedBatch);
      console.log(`  Total unsaved jobs collected so far: ${allUnsavedJobs.length}`);
      
      // Move database offset forward for next batch
      databaseOffset += REQUEST_SIZE;
      
      // If we got fewer jobs than REQUEST_SIZE, we've reached the end of database
      if (batchJobs.length < REQUEST_SIZE) {
        console.log('  Reached end of database (got fewer than REQUEST_SIZE)');
        hasMoreData = false;
        break;
      }
    }
    
    console.log(`Finished fetching: ${allUnsavedJobs.length} total unsaved jobs available`);
    
    // Extract the jobs for the current page
    const startIndex = targetOffset;
    const endIndex = startIndex + PAGE_SIZE;
    const toDisplay = allUnsavedJobs.slice(startIndex, endIndex);
    
    console.log(`Page ${page}: Showing jobs ${startIndex} to ${endIndex} (${toDisplay.length} jobs)`);
    
    allJobs = toDisplay;
    displayJobs(toDisplay);

    // Update pagination state
    currentPage = page;
    currentQuery = query;
    lastPageCount = toDisplay.length;
    updatePaginationControls();
    updateDbCountLabel(query, activeFilters);
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

    updateTotalJobsDisplay();
    return;
  }

  // Create and append job cards
  jobs.forEach(job => {
    const jobCard = createJobCard(job);
    container.appendChild(jobCard);
  });

  updateTotalJobsDisplay();
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
  const formatSalary = (min, max) => {
    if (!min && !max) return 'Salary not available';
    
    
    const symbol = '$';
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
  
  const salaryText = formatSalary(job.salary_min, job.salary_max);
  
  const matchData = matchScore[job.id];
  let badgeHTML = '';
  if (hasResume && matchData) {
    const matchColor = getMatchScoreColor(matchData.score);

    badgeHTML = `
      <div class="match-score-badge" style="
      position: absolute;
      top: 12px;
      right: 12px;
      background: ${matchColor};
      color: white;
      border-radius: 20px;
      font-weight: bold;
      z-index: 10;
      "> 
      ${matchData.score}% Match
      </div>
    `;
  }


  // Create job card HTML structure with all details (consistent order)
  card.style.position = 'relative';
  card.innerHTML = `
    ${badgeHTML}
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
    // Safari-specific: prevent all default behaviors and propagation
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Prevent multiple simultaneous saves
    if (isSavingJob) {
      return false;
    }
    isSavingJob = true;
    
    try {
      // Prevent count refetch while we're updating
      preventCountRefetch = true;
      
      // Save job to tracker
      await saveJobToTracker(job);
      
      // Store the current count before removing card
      const previousCount = typeof totalJobsCount === 'number' ? totalJobsCount : null;
      
      // Remove card from finder
      card.remove();

      // Update local count immediately (don't refetch from database to avoid reset)
      if(previousCount !== null && previousCount > 0) {
        totalJobsCount = Math.max(previousCount - 1, 0);
        // Persist to sessionStorage to survive page reloads (Safari bfcache)
        sessionStorage.setItem('finderTotalJobsCount', totalJobsCount.toString());
        sessionStorage.setItem('finderCountTimestamp', Date.now().toString());
      }
      
      // Update UI immediately without any async database calls
      updateTotalJobsDisplay();
      updatePaginationControls();

      console.log('Job saved and removed from finder:', job.title);
      console.log('Updated count:', totalJobsCount, '(prevented refetch, saved to sessionStorage)');
      
      // Keep preventCountRefetch true to prevent any automatic refetches
      // Reset it after a short delay in case something tries to refetch
      setTimeout(() => {
        preventCountRefetch = false;
        console.log('Count refetch prevention cleared');
      }, 2000);
      
      // Return false to prevent any default behavior (Safari-specific)
      return false;
    } catch (error) {
      console.error('Failed to save job:', error);
      alert('Failed to save job. Please try again.');
      // Don't remove card if save failed
      return false;
    } finally {
      isSavingJob = false;
    }
  }, false); // Use capture phase false for Safari compatibility
  
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openJobDetailOverlay(job);
  });

  if(job.description) {
    if (!job.description_summary) {
      loadJobDescriptionSummary(card, job.description);
    }
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
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Loaded job finder");
  await fetchMatchScores();
  console.log('Match scores loaded: ', hasResume ? 'Resume Found' : 'No resume found');
  // Check for saved count in sessionStorage (to persist count after page reload)
  const savedCount = sessionStorage.getItem('finderTotalJobsCount');
  const savedTimestamp = sessionStorage.getItem('finderCountTimestamp');
  let restoredFromSession = false;
  
  if (savedCount && savedTimestamp) {
    const age = Date.now() - parseInt(savedTimestamp);
    if (age < 5 * 60 * 1000) { // Only use if less than 5 minutes old
      totalJobsCount = parseInt(savedCount);
      restoredFromSession = true;
      // IMPORTANT: Set flag to prevent the database from overwriting our saved count
      preventCountRefetch = true;
      console.log('Restored count from sessionStorage on load:', totalJobsCount);
    } else {
      // Clear old sessionStorage
      sessionStorage.removeItem('finderTotalJobsCount');
      sessionStorage.removeItem('finderCountTimestamp');
    }
  }
  
  setupSearch();
  wirePaginationButtons();
  updateTotalJobsDisplay();
  
  // Only fetch count from database if we didn't restore from sessionStorage
  if (!restoredFromSession) {
    updateDbCountLabel('', currentFilters);
  }
  
  fetchJobs('');
  
  // Clear the preventCountRefetch flag after initial load completes
  // This allows future searches to get fresh counts from the database
  if (restoredFromSession) {
    setTimeout(() => {
      preventCountRefetch = false;
      // Clear sessionStorage after successful page load to prevent stale data
      sessionStorage.removeItem('finderTotalJobsCount');
      sessionStorage.removeItem('finderCountTimestamp');
      console.log('Cleared preventCountRefetch flag and sessionStorage after initial load');
    }, 3000); // Wait 3 seconds for initial load to complete
  }
  
  const pageCtrls = document.querySelector('.pagination-controls');
  if(pageCtrls){
    pageCtrls.style.display = 'flex';
  }

  // Check if we need to increment count (job was deleted from tracker's Saved column)
  if (localStorage.getItem('finderCountNeedsUpdate') === 'true') {
    if (typeof totalJobsCount === 'number') {
      totalJobsCount += 1;
      // Update sessionStorage as well
      sessionStorage.setItem('finderTotalJobsCount', totalJobsCount.toString());
      sessionStorage.setItem('finderCountTimestamp', Date.now().toString());
    } else {
      updateDbCountLabel(currentQuery, currentFilters);
    }
    updateTotalJobsDisplay();
    updatePaginationControls();
    localStorage.removeItem('finderCountNeedsUpdate');
    console.log('Incremented count after job was removed from Saved:', totalJobsCount);
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

// Safari-specific: Handle page restoration from cache (bfcache)
window.addEventListener('pageshow', (event) => {
  // If page was restored from cache, restore count from sessionStorage
  if (event.persisted) {
    const savedCount = sessionStorage.getItem('finderTotalJobsCount');
    const savedTimestamp = sessionStorage.getItem('finderCountTimestamp');
    
    // Only restore if it was saved recently (within last 5 minutes)
    if (savedCount && savedTimestamp) {
      const age = Date.now() - parseInt(savedTimestamp);
      if (age < 5 * 60 * 1000) { // 5 minutes
        totalJobsCount = parseInt(savedCount);
        updateTotalJobsDisplay();
        updatePaginationControls();
        preventCountRefetch = true;
        console.log('Restored count from sessionStorage after page restore:', totalJobsCount);
        
        // Clear the flag after a bit
        setTimeout(() => {
          preventCountRefetch = false;
        }, 1000);
        return;
      }
    }
    
    if (preventCountRefetch) {
      console.log('Page restored from cache - preventing count refetch');
      return;
    }
  }
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

  const totalPages = (typeof totalJobsCount === 'number' && totalJobsCount > 0) 
  ? Math.ceil(totalJobsCount / PAGE_SIZE) 
  : currentPage;

  const pageText = `Page ${currentPage} of ${totalPages}`;

  pageInfo.innerHTML = pageText;

  prevBtn.disabled = currentPage <= 1;

  // Only disable Next if we're at or past the last page
  // Don't use lastPageCount since client-side filtering can make it unreliable
  nextBtn.disabled = currentPage >= totalPages;
}

/**
 * Updates the total job count from the database
 * The database count now accurately subtracts saved jobs
 * Used for pagination display
 * @param {string} query - Search query to get count for
 */
async function updateDbCountLabel(query, filters = null) {
  // Don't refetch if we're preventing it (e.g., right after manual save for instant feedback)
  if (preventCountRefetch) {
    console.log('Skipping count refetch - preventCountRefetch flag is set');
    return;
  }
  
  try {
    const params = new URLSearchParams();
    if (query) params.append('q', query);

    const activeFilters = filters || currentFilters;

    if (activeFilters.employment_type) params.append('employment_type', activeFilters.employment_type);

    if (activeFilters.is_remote) params.append('is_remote', activeFilters.is_remote);

    if (activeFilters.location) params.append('location', activeFilters.location);

    if (activeFilters.salary_min) params.append('salary_min', activeFilters.salary_min);

    if (activeFilters.posted_date) params.append('posted_date', activeFilters.posted_date);

    const queryParam = params.toString() ? `?${params.toString()}` : '';

    const response = await fetch(`${API_BASE}/api/jobs/count${queryParam}`);
    if (!response.ok) return;

    const data = await response.json();

    if (typeof data.total === 'number') {
      totalJobsCount = data.total;
      // Clear sessionStorage since we now have the accurate count from database
      sessionStorage.removeItem('finderTotalJobsCount');
      sessionStorage.removeItem('finderCountTimestamp');
      updatePaginationControls();
      updateTotalJobsDisplay();
      console.log('Updated count from database:', totalJobsCount);
    }
  } catch (e) {
    // Silently handle errors for count updates
  }
}

function updateTotalJobsDisplay() {
  const totalJobsElement = document.getElementById('total-jobs-count');
  if (!totalJobsElement) return;
  if (typeof totalJobsCount === 'number') {
    totalJobsElement.textContent = totalJobsCount.toLocaleString();
  } else {
    totalJobsElement.textContent = '...';
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
    initializeFilters();
    initializeResumeUpload();
});

function initializeFilters() {
  const applyFiltersBtn = document.getElementById('applyFilters');
  const clearFiltersBtn = document.getElementById('clearFilters');

  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', () => {
      const jobTypeSelect = document.getElementById('jobType');
      const remoteCheckbox = document.getElementById('remote');
      const locationInput = document.getElementById('location');
      const salaryInput = document.getElementById('salary');
      const datePostedSelect = document.getElementById('datePosted');

      currentFilters.employment_type = jobTypeSelect ? jobTypeSelect.value : '';
      currentFilters.is_remote = remoteCheckbox ? remoteCheckbox.checked : false;
      currentFilters.location = locationInput ? locationInput.value.trim() : '';
      currentFilters.salary_min = salaryInput ? salaryInput.value.trim() : '';
      currentFilters.posted_date = datePostedSelect ? datePostedSelect.value : '';


      fetchJobs(currentQuery, 1, currentFilters);
      const filterPanel = document.getElementById('filter-panel');
      if (filterPanel) filterPanel.style.display = 'none';
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      const jobTypeSelect = document.getElementById('jobType');
      const remoteCheckbox = document.getElementById('remote');
      const locationInput = document.getElementById('location');
      const salaryInput = document.getElementById('salary');
      const datePostedSelect = document.getElementById('datePosted');

      if (jobTypeSelect) jobTypeSelect.value = '';
      if (remoteCheckbox) remoteCheckbox.checked = false;
      if (locationInput) locationInput.value = '';
      if (salaryInput) salaryInput.value = '';
      if (datePostedSelect) datePostedSelect.value = '';

      currentFilters = {
        employment_type: '',
        is_remote: false,
        location: '',
        salary_min: '',
        posted_date: ''
      };

      fetchJobs(currentQuery, 1, currentFilters);
      const filterPanel = document.getElementById('filter-panel');
      if (filterPanel) filterPanel.style.display = 'none';
    });
  }
}

function initializeResumeUpload() {
  const dropZone = document.getElementById('dropZone');
  const resumeFile = document.getElementById('resumeFile');

  if (!dropZone || !resumeFile) return;

  resumeFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleResumeUpload(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      handleResumeUpload(file);
    }
  });

}

async function handleResumeUpload(file) {

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedTypes.includes(file.type)) {
    alert("Wrong file type, please use a different file");
    return;
  }

  const formData = new FormData();
  formData.append('resume', file);

  try {
    const dropZone = document.getElementById('dropZone');
    const originalContent = dropZone.innerHTML;
    dropZone.innerHTML = `
    <div class="upload-loading" style="text-align: center; padding: 20px;">
      <p> Uploading and analyzing resume... </p>
      <p> Calculating match scores for all jobs </p>
    </div> 
    `;

    const response = await fetch(`${API_BASE}/api/resume/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload resume');
    }

    const result = await response.json();
    console.log('Resume uploaded and parsed: ', result);
    alert('Resume uploaded successfully');

    await fetchMatchScores();
    console.log('Match scores refreshed after upload');

    await fetchJobs(currentQuery, currentPage, currentFilters);
    console.log('Job listings refreshed after match scores');

    const matchCount = Object.keys(matchScore).length;
    const avgScore = result.averageScore || 0;
    
    dropZone.innerHTML = `
    <div class="upload-success">
    <p>Resume Uploaded!</p>
    </div>

    `;


    document.getElementById('uploadNewResume').addEventListener('click', () => {
      dropZone.innerHTML = originalContent;
      const newFileInput = document.getElementById('resumeFile');

      if (newFileInput) {
        newFileInput.addEventListener('change', (e) => {
        const newFile = e.target.files[0];
        if (newFile) handleResumeUpload(newFile);

        });

      }

    });
    alert(`Resume uploaded succesfully! Matched against ${matchCount} jobs with an average score of ${averageScore}%.`);

  } catch (err) {
    console.error('Error uploading resume', err);
    alert('Failed to upload resume. Please try again');

    const dropZone = document.getElementById('dropZone');
    console.error('Error matching jobs', err);
    dropZone.innerHTML = `<div class="file-input-container"`;
    // come back to this 
    document.getElementById('resumeFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleResumeUpload(file);
    });

  }

}

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
  const formatSalary = (min, max) => {
    if (!min && !max) return 'Salary not available';
    
    
    
    const symbol = '$';
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
  
  const salaryText = formatSalary(job.salary_min, job.salary_max);
  salaryElement.textContent = salaryText;
  salaryContainer.style.display = 'block';
  
  // Always show remote container
  const remoteContainer = document.getElementById('overlay-remote-container');
  document.getElementById('overlay-remote').textContent = job.is_remote ? 'Yes' : 'No';
  remoteContainer.style.display = 'block';

  const matchSection = document.getElementById('overlay-matched-section');
  const matchData = matchScore[job.id];

  if (hasResume && matchData && matchSection) {
    matchSection.style.display = 'block';

    const scoreColor = getMatchScoreColor(matchData.score);

    const scoreElement = document.getElementById('overlay-match-score');
    scoreElement.textContent = `${matchData.score}%`;
    scoreElement.style.color = scoreColor;
    //COME BACK AND ADD HTML
    const progressBar = document.getElementById('overlay-progress-bar');
    progressBar.style.width = `${matchData.score}%`;
    progressBar.style.background = scoreColor;
  }
  
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
      // Prevent count refetch while we're updating
      preventCountRefetch = true;
      
      await saveJobToTracker(job);
      closeJobDetailOverlay();
      document.querySelectorAll('.job-card').forEach(card => {
        if (card.querySelector('.job-title').textContent === job.title) card.remove();
      });

      // Store the current count before decrementing
      const previousCount = typeof totalJobsCount === 'number' ? totalJobsCount : null;
      
      if(previousCount !== null && previousCount > 0) {
        totalJobsCount = Math.max(previousCount - 1, 0);
        // Persist to sessionStorage to survive page reloads
        sessionStorage.setItem('finderTotalJobsCount', totalJobsCount.toString());
        sessionStorage.setItem('finderCountTimestamp', Date.now().toString());
      } 
      
      updateTotalJobsDisplay();
      updatePaginationControls();
      
      console.log('Job saved from overlay:', job.title);
      console.log('Updated count:', totalJobsCount, '(saved to sessionStorage)');
      
      // Reset the flag after a delay
      setTimeout(() => {
        preventCountRefetch = false;
        console.log('Count refetch prevention cleared');
      }, 2000);

    } catch (error) {
      alert('Failed to save job. Please try again.');
      preventCountRefetch = false;
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

