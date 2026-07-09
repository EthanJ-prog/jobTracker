/* finder.ui.js - UI helpers: pagination/count display + filters toggle + common init */

(function () {
  const state = window.PathfinderFinderState;
  const PF = window.Pathfinder;
  if (!state || !PF || !window.PathfinderFinderCore) return;

  function showFiltersPanel(isOpen) {
    const panel = document.getElementById('filter-panel');
    if (!panel) return;
    if (typeof isOpen === 'boolean') {
      if (isOpen) panel.classList.add('is-open');
      else panel.classList.remove('is-open');
    } else {
      panel.classList.toggle('is-open');
    }

    const filterButton = document.querySelector('.filter-button');
    if (filterButton) filterButton.setAttribute('aria-expanded', String(panel.classList.contains('is-open')));
  }

  function toggleFilters() {
    showFiltersPanel();
  }

  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function updatePaginationControls() {
    window.PathfinderFinderCore.updatePaginationControls();
  }

  function updateTotalJobsDisplay() {
    window.PathfinderFinderCore.updateTotalJobsDisplay();
  }

  function updateDbCountLabel(query, filters) {
    return window.PathfinderFinderCore.updateDbCountLabel(query, filters);
  }

  function setupAuthNav() {
    window.PathfinderFinderAuth = window.PathfinderFinderAuth || {};
    PF.setupAuthNav();
  }

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

        state.currentFilters.employment_type = jobTypeSelect ? jobTypeSelect.value : '';
        state.currentFilters.is_remote = remoteCheckbox ? remoteCheckbox.checked : false;
        state.currentFilters.location = locationInput ? locationInput.value.trim() : '';
        state.currentFilters.salary_min = salaryInput ? salaryInput.value.trim() : '';
        state.currentFilters.posted_date = datePostedSelect ? datePostedSelect.value : '';

        window.PathfinderFinderCore.fetchJobs(state.currentQuery, 1, state.currentFilters);
        showFiltersPanel(false);
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

        state.currentFilters = {
          employment_type: '',
          is_remote: false,
          location: '',
          salary_min: '',
          posted_date: ''
        };

        window.PathfinderFinderCore.fetchJobs(state.currentQuery, 1, state.currentFilters);
        showFiltersPanel(false);
      });
    }

    // expose handler used by inline onclick
    window.toggleFilters = toggleFilters;
  }

  function setupPaginationVisibility() {
    const pageCtrls = document.querySelector('.pagination-controls');
    if (pageCtrls) pageCtrls.style.display = 'flex';
  }

  function restoreCountFromSession() {
    const savedCount = sessionStorage.getItem('finderTotalJobsCount');
    const savedTimestamp = sessionStorage.getItem('finderCountTimestamp');

    let restored = false;
    if (savedCount && savedTimestamp) {
      const age = Date.now() - parseInt(savedTimestamp);
      if (age < 5 * 60 * 1000) {
        state.totalJobsCount = parseInt(savedCount);
        restored = true;
        state.preventCountRefetch = true;
      } else {
        sessionStorage.removeItem('finderTotalJobsCount');
        sessionStorage.removeItem('finderCountTimestamp');
      }
    }

    return restored;
  }

  function maybeRestoreLastPage() {
    let initialPage = 1;
    if (!sessionStorage.getItem('finderTotalJobsCount')) return initialPage;

    try {
      const savedPage = sessionStorage.getItem('finderCurrentPage');
      if (!savedPage) return initialPage;
      const parsed = parseInt(savedPage, 10);
      if (!isNaN(parsed) && parsed > 0) initialPage = parsed;
    } catch (e) {}

    return initialPage;
  }

  function setupInitHooks() {
    PF.setupAuthNav();
    initializeFilters();

    setupPaginationVisibility();
  }

  window.PathfinderFinderUI = {
    toggleFilters,
    updatePaginationControls,
    updateTotalJobsDisplay,
    updateDbCountLabel,
    setupAuthNav,
    setupInitHooks,
    restoreCountFromSession,
    maybeRestoreLastPage
  };
})();

