/* finder.cards.js - job listing cards + overlay wiring */

(function () {
  const core = window.PathfinderFinderCore;
  const state = window.PathfinderFinderState;
  const PF = window.Pathfinder;

  if (!core || !state || !PF) return;

  function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.dataset.jobId = job.id || '';

    const formattedDate = job.posted_date
      ? new Date(job.posted_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : '';

    const formattedCreatedDate = job.created_at
      ? new Date(job.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

    const formatValue = (value, fallback = 'N/A') => {
      if (!value) return fallback;
      if (typeof value === 'string' && value.trim() === '') return fallback;
      return value;
    };

    const remoteStatus = job.is_remote === 1 ? 'Remote' : job.is_remote === 0 ? 'On-site' : 'N/A';
    const employmentType = formatValue(job.employment_type || job.type, 'Not specified');

    const formatSalary = (min, max) => {
      if (!min && !max) return 'Salary not available';
      const symbol = '$';
      const formatNumber = (num) => (num ? num.toLocaleString() : '');
      if (min && max) return `${symbol}${formatNumber(min)} - ${symbol}${formatNumber(max)}`;
      if (min) return `${symbol}${formatNumber(min)}+`;
      if (max) return `Up to ${symbol}${formatNumber(max)}`;
      return 'Salary not available';
    };

    const salaryText = formatSalary(job.salary_min, job.salary_max);

    const matchData = state.matchScore[job.id];
    let badgeHTML = '';
    if (state.hasResume && matchData && typeof matchData.score === 'number') {
      const matchColor = core.getMatchScoreColor(matchData.score);
      badgeHTML = `
        <div class="match-score-badge" style="background: ${matchColor};">
          ${matchData.score}% Match
        </div>
      `;
    }

    if (job.location || job.latitude || job.longitude) {
      card.classList.add('job-card--mapped');
    }

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
          <p class="job-description-text">${job.description_summary ? `<strong>Description: </strong>${core.truncateText(job.description_summary, 150)}` : '<em>Description unavailable</em>'}</p>
        </div>
      </div>
      <button class="map-button" type="button">Show on map</button>
      <button class="apply-button" ${job.apply_link ? '' : 'disabled'}> Apply </button>
      <button type="button" class="star-button">&#9734;</button>
    `;

    const mapButton = card.querySelector('.map-button');
    if (mapButton) {
      mapButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (window.PathfinderFinderMap && typeof window.PathfinderFinderMap.focusJobOnMap === 'function') {
          window.PathfinderFinderMap.focusJobOnMap(job.id);
        }
      });
    }

    const applyButton = card.querySelector('.apply-button');
    if (job.apply_link && applyButton) {
      applyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(job.apply_link, '_blank');
      });
    }

    const starButton = card.querySelector('.star-button');
    if (starButton) {
      starButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (state.isSavingJob) return;
        state.isSavingJob = true;
        try {
          if (!window.PathfinderFinderResume || typeof window.PathfinderFinderResume.saveJobToTracker !== 'function') {
            alert('Saving is temporarily unavailable.');
            return;
          }
          await window.PathfinderFinderResume.saveJobToTracker(job);

          const previousCount = typeof state.totalJobsCount === 'number' ? state.totalJobsCount : null;
          card.remove();

          if (previousCount !== null && previousCount > 0) {
            state.totalJobsCount = Math.max(previousCount - 1, 0);
            try {
              sessionStorage.setItem('finderTotalJobsCount', state.totalJobsCount.toString());
              sessionStorage.setItem('finderCountTimestamp', Date.now().toString());
              sessionStorage.setItem('finderCurrentPage', state.currentPage.toString());
            } catch (err) {}
          }

          core.updateTotalJobsDisplay();
          core.updatePaginationControls();
        } catch (err) {
          console.error('Failed to save job:', err);
          alert('Failed to save job. Please try again.');
        } finally {
          state.isSavingJob = false;
        }
      }, false);
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (window.PathfinderFinderOverlay && typeof window.PathfinderFinderOverlay.openJobDetailOverlay === 'function') {
        window.PathfinderFinderOverlay.openJobDetailOverlay(job);
      }
    });

    if (job.description) {
      // If summary missing, keep behavior via overlay module later.
    } else {
      const descElement = card.querySelector('.job-description-text');
      if (descElement) descElement.innerHTML = '<em>No description available</em>';
    }

    return card;
  }

  function displayJobs(jobs) {
    const container = document.querySelector('.job-listings-container');
    if (!container) return;
    container.innerHTML = '';

    if (!jobs || jobs.length === 0) {
      container.innerHTML = `
        <div class="no-jobs-message">
          <h3>No jobs found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      `;
      core.updateTotalJobsDisplay();
      return;
    }

    jobs.forEach(job => container.appendChild(createJobCard(job)));
    core.updateTotalJobsDisplay();
  }

  window.PathfinderFinderCards = {
    displayJobs,
    createJobCard
  };
})();

