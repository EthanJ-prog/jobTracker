/* finder.overlay.js - job detail overlay (modal) */

(function () {
  const state = window.PathfinderFinderState;
  const core = window.PathfinderFinderCore;

  if (!state || !core) return;

  function closeJobDetailOverlay() {
    const overlay = document.getElementById('job-detail-overlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  function openJobDetailOverlay(job) {
    const overlay = document.getElementById('job-detail-overlay');
    if (!overlay) return;

    document.getElementById('overlay-job-title').textContent = job.title || 'No title';
    document.getElementById('overlay-company').textContent = job.company || 'No company';
    document.getElementById('overlay-location').textContent = job.location || 'No location';
    document.getElementById('overlay-employment-type').textContent = job.employment_type || 'No type';

    document.getElementById('overlay-posted-date').textContent = job.posted_date
      ? new Date(job.posted_date).toLocaleDateString()
      : 'No date';

    const createdDateElement = document.getElementById('overlay-created-date');
    if (createdDateElement) {
      createdDateElement.textContent = job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Unknown';
    }

    // salary
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
    document.getElementById('overlay-salary').textContent = salaryText;
    document.getElementById('overlay-salary-container').style.display = 'block';

    // remote
    document.getElementById('overlay-remote').textContent = job.is_remote ? 'Yes' : 'No';
    document.getElementById('overlay-remote-container').style.display = 'block';

    // match section
    const matchSection = document.getElementById('overlay-match-section');
    const matchData = state.matchScore[job.id];

    if (state.hasResume && matchData && matchSection) {
      matchSection.style.display = 'block';

      const scoreColor = core.getMatchScoreColor(matchData.score);
      document.getElementById('overlay-match-score').textContent = `${matchData.score}%`;
      document.getElementById('overlay-match-score').style.color = scoreColor;
      document.getElementById('overlay-match-bar').style.width = `${matchData.score}%`;
      document.getElementById('overlay-match-bar').style.background = scoreColor;

      const breakdown = matchData.breakdown || {};
      document.getElementById('overlay-technical-score').textContent = `${breakdown.technical || 0}`;
      document.getElementById('overlay-technical-score').style.color = core.getMatchScoreColor(breakdown.technical);

      document.getElementById('overlay-softSkills-score').textContent = `${breakdown.softSkills || 0}`;
      document.getElementById('overlay-softSkills-score').style.color = core.getMatchScoreColor(breakdown.softSkills);

      document.getElementById('overlay-experience-score').textContent = `${breakdown.experience || 0}`;
      document.getElementById('overlay-experience-score').style.color = core.getMatchScoreColor(breakdown.experience);

      document.getElementById('overlay-education-score').textContent = `${breakdown.education || 0}`;
      document.getElementById('overlay-education-score').style.color = core.getMatchScoreColor(breakdown.education);

      // skills
      const matchedSkillsContainer = document.getElementById('overlay-matched-skills');
      const matchedSkills = matchData.matchedSkills || {};
      const allMatchedSkills = [
        ...(matchedSkills.technical || []),
        ...(matchedSkills.softSkills || [])
      ];

      matchedSkillsContainer.innerHTML =
        allMatchedSkills.length > 0
          ? allMatchedSkills.map(s => `<span class="skill-tag">${s}</span>`).join('')
          : '<span class="no-skills-message">No matching skills found</span>';

      const missingSkillsContainer = document.getElementById('overlay-missing-skills');
      const missingSkills = matchData.missingSkills || {};
      const allMissingSkills = [
        ...(missingSkills.technical || []),
        ...(missingSkills.softSkills || [])
      ];

      if (allMissingSkills.length > 0) {
        const displaySkills = allMissingSkills.slice(0, 10);
        const moreCount = allMissingSkills.length - displaySkills.length;

        let html = displaySkills.map(s => `<span class="skill-tag">${s}</span>`).join('');
        if (moreCount > 0) {
          html += `<span class="skill-tag" style="background: rgb(255, 255, 255); color: rgb(83, 83, 83);">+${moreCount} more </span>`;
        }
        missingSkillsContainer.innerHTML = html;
      } else {
        missingSkillsContainer.innerHTML = '<span class ="no-skills-message"> Great! No key skills missing</span>';
      }
    } else {
      if (matchSection) matchSection.style.display = 'none';
    }

    // description
    const desc = job.description
      ? job.description
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim()
      : 'No description available';

    document.getElementById('overlay-description').innerHTML = desc.replace(/\n/g, '<br>');

    // apply button
    const applyBtn = document.getElementById('overlay-apply-button');
    if (job.apply_link) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Now';
      applyBtn.onclick = () => window.open(job.apply_link, '_blank');
    } else {
      applyBtn.disabled = true;
      applyBtn.textContent = 'No Apply Link';
    }

    // save button (delegated to resume module later)
    document.getElementById('overlay-save-button').onclick = async () => {
      if (window.PathfinderFinderResume && typeof window.PathfinderFinderResume.saveJobToTracker === 'function') {
        try {
          window.PathfinderFinderResume.preventCountRefetch = true;
          await window.PathfinderFinderResume.saveJobToTracker(job);
          closeJobDetailOverlay();
          document.querySelectorAll('.job-card').forEach(card => {
            const titleEl = card.querySelector('.job-title');
            if (titleEl && titleEl.textContent === job.title) card.remove();
          });
        } catch (e) {
          alert('Failed to save job. Please try again.');
        } finally {
          window.PathfinderFinderResume.preventCountRefetch = false;
        }
      } else {
        alert('Save is temporarily unavailable.');
      }
    };

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function initializeJobDetailOverlay() {
    const overlay = document.getElementById('job-detail-overlay');
    const closeBtn = document.getElementById('close-overlay');

    if (closeBtn) closeBtn.addEventListener('click', closeJobDetailOverlay);

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeJobDetailOverlay();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('show')) closeJobDetailOverlay();
      });
    }
  }

  window.PathfinderFinderOverlay = {
    openJobDetailOverlay,
    initializeJobDetailOverlay,
    closeJobDetailOverlay
  };
})();

