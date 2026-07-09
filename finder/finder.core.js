/* finder.core.js - shared state + API fetching + pagination/search/sorting for Job Finder */

(function () {
  const API_BASE = 'http://localhost:3000';
  const PF = window.Pathfinder;

  const PAGE_SIZE = 8;
  const REQUEST_SIZE = PAGE_SIZE * 5;

  const state = {
    allJobs: [],
    allActiveJobsForMap: [],
    currentPage: 1,
    currentQuery: '',
    totalJobsCount: null,
    isSavingJob: false,
    preventCountRefetch: false,
    lastPageCount: 0,
    markerCount: 0,
    currentFilters: {
      employment_type: '',
      is_remote: false,
      location: '',
      salary_min: '',
      posted_date: ''
    },
    matchScore: {},
    hasResume: false,
    // map tab module will update this
    allJobsForMap: []
  };

  function getAuthToken() {
    return PF.getAuthToken();
  }

  function showLoadingMessage() {
    const container = document.querySelector('.job-listings-container');
    if (!container) return;
    container.innerHTML = `
      <div class="loading-message">
        <h3>Loading jobs...</h3>
        <p>Please wait while we fetch the latest job listings.</p>
      </div>
    `;
  }

  function showErrorMessage(message) {
    const container = document.querySelector('.job-listings-container');
    if (!container) return;
    container.innerHTML = `
      <div class="error-message">
        <h3>Oops, something went wrong</h3>
        <p>${message}</p>
        <button type="button" onclick="fetchJobs()">Try Again</button>
      </div>
    `;
  }

  function escapeHtml(value) {
    return PF.escapeHtml(value);
  }

  function getMatchScoreColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#eab308';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  }

  function truncateText(text, maxLength = 150) {
    if (!text) return '';
    if (text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength - 50) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }

  async function fetchMatchScores() {
    const token = getAuthToken();

    if (!token) {
      state.hasResume = false;
      state.matchScore = {};
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/matches`, {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!response.ok) {
        console.error('Failed to fetch match scores');
        return;
      }

      const data = await response.json();
      state.hasResume = data.hasResume;
      state.matchScore = data.matches || {};
    } catch (err) {
      console.error('Error fetching match scores: ', err);
    }
  }

  async function getSavedJobs() {
    try {
      const token = getAuthToken();
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const response = await fetch(`${API_BASE}/jobs`, { headers });
      const jobs = await response.json();
      return jobs.filter(job => job.status === 'saved');
    } catch (error) {
      console.error('Failed to get saved jobs:', error);
      return [];
    }
  }

  function applySort(allJobs, sortValue) {
    const matchScore = state.matchScore;

    if (sortValue === 'match-desc') {
      allJobs.sort((a, b) => {
        const aScore = matchScore[a.id] && typeof matchScore[a.id].score === 'number' ? matchScore[a.id].score : -1;
        const bScore = matchScore[b.id] && typeof matchScore[b.id].score === 'number' ? matchScore[b.id].score : -1;
        return bScore - aScore;
      });
      return;
    }

    if (sortValue === 'match-asce') {
      allJobs.sort((a, b) => {
        const aScore = matchScore[a.id] && typeof matchScore[a.id].score === 'number' ? matchScore[a.id].score : -1;
        const bScore = matchScore[b.id] && typeof matchScore[b.id].score === 'number' ? matchScore[b.id].score : -1;
        return aScore - bScore;
      });
      return;
    }

    if (sortValue === 'date-desc' || sortValue === 'date-asce') {
      allJobs.sort((a, b) => {
        const aHasDate = !!a.posted_date;
        const bHasDate = !!b.posted_date;
        if (!aHasDate && !bHasDate) return 0;
        if (!aHasDate) return 1;
        if (!bHasDate) return -1;

        const aTime = new Date(a.posted_date).getTime();
        const bTime = new Date(b.posted_date).getTime();
        return sortValue === 'date-desc' ? bTime - aTime : aTime - bTime;
      });
    }
  }

  async function fetchJobs(query = '', page = 1, filters = null) {
    const activeFilters = filters || state.currentFilters;
    showLoadingMessage();

    try {
      const savedJobs = await getSavedJobs();
      const targetOffset = (page - 1) * PAGE_SIZE;

      let allUnsavedJobs = [];
      let databaseOffset = 0;
      const maxFetchAttempts = 20;
      let fetchAttempts = 0;
      let hasMoreData = true;

      const sortSelect = document.getElementById('sort-select');
      const sortValue = sortSelect ? sortSelect.value : '';
      const requireGlobalFetch = sortValue !== '';

      while (
        (requireGlobalFetch || allUnsavedJobs.length < targetOffset + PAGE_SIZE) &&
        hasMoreData &&
        fetchAttempts < maxFetchAttempts
      ) {
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

        const response = await fetch(`${API_BASE}/api/jobs?${params.toString()}`);
        if (!response.ok) throw new Error(`API error ${response.status}`);

        const data = await response.json();
        const batchJobs = Array.isArray(data.jobs) ? data.jobs : [];

        if (batchJobs.length === 0) {
          hasMoreData = false;
          break;
        }

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

        allUnsavedJobs = allUnsavedJobs.concat(unsavedBatch);
        databaseOffset += REQUEST_SIZE;

        if (batchJobs.length < REQUEST_SIZE) {
          hasMoreData = false;
          break;
        }
      }

      // optional global sort for better UX
      try { applySort(allUnsavedJobs, sortValue); } catch (err) { console.warn('Sorting failed:', err); }


      state.allActiveJobsForMap = [...allUnsavedJobs];

      const startIndex = targetOffset;
      const endIndex = startIndex + PAGE_SIZE;
      const toDisplay = allUnsavedJobs.slice(startIndex, endIndex);

      state.allJobs = toDisplay;
      if (window.PathfinderFinderCards && typeof window.PathfinderFinderCards.displayJobs === 'function') {
        window.PathfinderFinderCards.displayJobs(toDisplay);
      }
      if (window.PathfinderFinderMap && typeof window.PathfinderFinderMap.updateJobMap === 'function') {
        window.PathfinderFinderMap.updateJobMap(state.allActiveJobsForMap);
      }

      state.currentPage = page;
      state.currentQuery = query;
      state.lastPageCount = toDisplay.length;

      try {
        sessionStorage.setItem('finderCurrentPage', page.toString());
      } catch (e) {}

      if (window.PathfinderFinderUI && typeof window.PathfinderFinderUI.updatePaginationControls === 'function') {
        window.PathfinderFinderUI.updatePaginationControls();
      }
      if (window.PathfinderFinderUI && typeof window.PathfinderFinderUI.updateDbCountLabel === 'function') {
        window.PathfinderFinderUI.updateDbCountLabel(query, activeFilters);
      }
    } catch (error) {
      console.error('Failed to load job:', error);
      showErrorMessage(error.message);
    }
  }

  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    const debounced = debounce((term) => fetchJobs(term, 1), 400);

    searchInput.addEventListener('input', (e) => {
      const trimmed = e.target.value.trim();
      if (trimmed.length === 0) fetchJobs('', 1);
      else debounced(trimmed);
    });
  }

  function wirePaginationButtons() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.currentPage > 1) fetchJobs(state.currentQuery, state.currentPage - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        fetchJobs(state.currentQuery, state.currentPage + 1);
      });
    }
  }

  function setupSort() {
    const sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;
    sortSelect.addEventListener('change', () => {
      fetchJobs(state.currentQuery, 1, state.currentFilters);
    });
  }

  async function updateDbCountLabel(query, filters = null) {
    if (state.preventCountRefetch) return;

    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);

      const activeFilters = filters || state.currentFilters;

      if (activeFilters.employment_type) params.append('employment_type', activeFilters.employment_type);
      if (activeFilters.is_remote) params.append('is_remote', activeFilters.is_remote);
      if (activeFilters.location) params.append('location', activeFilters.location);
      if (activeFilters.salary_min) params.append('salary_min', activeFilters.salary_min);
      if (activeFilters.posted_date) params.append('posted_date', activeFilters.posted_date);

      const token = getAuthToken();
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;

      const response = await fetch(`${API_BASE}/api/jobs/count${params.toString() ? '?' + params.toString() : ''}`, { headers });
      if (!response.ok) return;

      const data = await response.json();
      if (typeof data.total === 'number') {
        state.totalJobsCount = data.total;
        try {
          sessionStorage.removeItem('finderTotalJobsCount');
          sessionStorage.removeItem('finderCountTimestamp');
        } catch (e) {}

        if (window.PathfinderFinderUI && typeof window.PathfinderFinderUI.updatePaginationControls === 'function') {
          window.PathfinderFinderUI.updatePaginationControls();
        }
        if (window.PathfinderFinderUI && typeof window.PathfinderFinderUI.updateTotalJobsDisplay === 'function') {
          window.PathfinderFinderUI.updateTotalJobsDisplay();
        }
      }
    } catch (e) {}
  }

  function updateTotalJobsDisplay() {
    const el = document.getElementById('total-jobs-count');
    if (!el) return;
    if (typeof state.totalJobsCount === 'number') el.textContent = state.totalJobsCount.toLocaleString();
    else el.textContent = '...';
  }

  function updatePaginationControls() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    if (!prevBtn || !nextBtn || !pageInfo) return;

    const totalPages = typeof state.totalJobsCount === 'number' && state.totalJobsCount > 0
      ? Math.ceil(state.totalJobsCount / PAGE_SIZE)
      : state.currentPage;

    pageInfo.innerHTML = `Page ${state.currentPage} of ${totalPages}`;
    prevBtn.disabled = state.currentPage <= 1;
    nextBtn.disabled = state.currentPage >= totalPages;
  }

  function setupUICommon() {
    setupSearch();
    wirePaginationButtons();
    setupSort();
  }

  function setupExports() {
    window.PathfinderFinderState = state;

    // expose fetchJobs globally because finder.html has an inline onclick in error UI
    window.fetchJobs = fetchJobs;

    window.PathfinderFinderCore = {
      fetchMatchScores,
      fetchJobs,
      getAuthToken,
      escapeHtml,
      getMatchScoreColor,
      truncateText,
      updateDbCountLabel,
      updateTotalJobsDisplay,
      updatePaginationControls,
      setupUICommon,
      PAGE_SIZE
    };
  }

  setupExports();
})();

