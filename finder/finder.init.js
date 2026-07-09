/* finder.init.js - wires all finder feature modules without changing behavior */

(function () {
  const core = window.PathfinderFinderCore;
  const ui = window.PathfinderFinderUI;
  const state = window.PathfinderFinderState;

  if (!core || !ui || !state) {
    // modules not ready yet
    window.addEventListener('DOMContentLoaded', () => {
      console.error('Finder init: missing dependencies');
    });
    return;
  }

  // Stubs only if modules are missing (should not happen with updated finder.html).
  if (!window.PathfinderFinderCards) window.PathfinderFinderCards = { displayJobs() {}, createJobCard() {} };
  if (!window.PathfinderFinderMap) window.PathfinderFinderMap = { updateJobMap() {}, initializeJobMap() {}, focusJobOnMap() {} };
  if (!window.PathfinderFinderResume) window.PathfinderFinderResume = { initializeResumeUpload() {}, saveJobToTracker() {} };


  function wireTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabID = button.dataset.tab;

        // resume match requires auth
        if (tabID === 'resume' && !core.getAuthToken()) {
          alert('Please log in to use Resume Match.');
          window.location.href = '../auth/signup.html';
          return;
        }

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(`${tabID}-tab`).classList.add('active');

        const boardSection = document.querySelector('.board');
        if (boardSection) boardSection.style.display = tabID === 'jobs' ? '' : 'none';

        const filterPanel = document.getElementById('filter-panel');
        if (filterPanel && tabID !== 'jobs') filterPanel.classList.remove('is-open');

        const pageCtrls = document.querySelector('.pagination-controls');
        if (pageCtrls) pageCtrls.style.display = tabID === 'jobs' ? 'flex' : 'none';

        if (tabID === 'map') {
          if (window.PathfinderFinderMap && typeof window.PathfinderFinderMap.initializeJobMap === 'function') {
            window.PathfinderFinderMap.initializeJobMap();
          }
          setTimeout(() => {
            // refresh map with current list if map module implements it
            if (window.PathfinderFinderMap && typeof window.PathfinderFinderMap.updateJobMap === 'function') {
              window.PathfinderFinderMap.updateJobMap(state.allActiveJobsForMap);
            }
          }, 200);
        }
      });
    });
  }

  function setupPageLoad() {
    core.setupUICommon();
    ui.setupInitHooks();
    wireTabs();

    // initialize resume upload controls (if present on this page)
    if (window.PathfinderFinderResume && typeof window.PathfinderFinderResume.initializeResumeUpload === 'function') {
      window.PathfinderFinderResume.initializeResumeUpload();
    }

  }

  window.PathfinderFinder = {
    init: async function () {
      setupPageLoad();

      // load resume match scoring (affects badges/colors)
      await core.fetchMatchScores();

      // Restore persisted total count for bfcache/safari
      const restored = ui.restoreCountFromSession();
      let initialPage = ui.maybeRestoreLastPage();

      if (restored) {
        // allow UI to update with restored count
        ui.updateTotalJobsDisplay();
        ui.updatePaginationControls();
      } else {
        ui.updateDbCountLabel('', state.currentFilters);
      }

      // initial load
      await core.fetchJobs('', initialPage, state.currentFilters);

      if (restored) {
        setTimeout(() => {
          state.preventCountRefetch = false;
          try {
            sessionStorage.removeItem('finderTotalJobsCount');
            sessionStorage.removeItem('finderCountTimestamp');
          } catch (e) {}
        }, 3000);
      }

      // handle “count needs update” flag after job deleted from saved tracker
      if (localStorage.getItem('finderCountNeedsUpdate') === 'true') {
        if (typeof state.totalJobsCount === 'number') {
          state.totalJobsCount += 1;
          try {
            sessionStorage.setItem('finderTotalJobsCount', state.totalJobsCount.toString());
            sessionStorage.setItem('finderCountTimestamp', Date.now().toString());
          } catch (e) {}
        } else {
          ui.updateDbCountLabel(state.currentQuery, state.currentFilters);
        }
        ui.updateTotalJobsDisplay();
        ui.updatePaginationControls();
        localStorage.removeItem('finderCountNeedsUpdate');
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
    }
  };
})();

