/* finder.resume.js - resume upload/remove + save job + summary fetch */

(function () {
  const PF = window.Pathfinder;
  const core = window.PathfinderFinderCore;
  const state = window.PathfinderFinderState;

  if (!PF || !core || !state) return;

  const API_BASE = 'http://localhost:3000';

  function getAuthToken() {
    return PF.getAuthToken();
  }

  async function fetchJobDescriptionSummary(card, description) {
    try {
      const descElement = card.querySelector('.job-description-text');
      if (!descElement) return;

      const response = await fetch(`${API_BASE}/api/jobs/summarize-description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description })
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();

      descElement.innerHTML = data.summary ? `<strong>Description: </strong>${data.summary}` : '<em>Unable to generate summary</em>';
    } catch (err) {
      console.error('Unable to fetch job description text: ', err);
      const descElement = card.querySelector('.job-description-text');
      if (descElement) descElement.innerHTML = '<em>Description summary unavailable</em>';
    }
  }

  async function saveJobToTracker(job) {
    const token = getAuthToken();
    if (!token) {
      alert('Please sign in to save jobs to the tracker.');
      window.location.href = '../auth/signup.html';
      return;
    }

    const jobData = {
      title: job.title || '',
      company: job.company || '',
      date: job.posted_date ? new Date(job.posted_date).toISOString().split('T')[0] : '',
      link: job.apply_link || '',
      notes: `Found via Job Finder - ${job.location || ''} - ${job.employment_type || ''}`,
      status: 'saved'
    };

    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

    await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(jobData)
    });
  }

  function setResumeProcessing(isProcessing) {
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(button => { button.disabled = isProcessing; });

    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => { button.disabled = isProcessing; });

    const resumeFile = document.getElementById('resumeFile');
    if (resumeFile) resumeFile.disabled = isProcessing;

    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
      dropZone.style.pointerEvents = isProcessing ? 'none' : '';
      dropZone.style.opacity = isProcessing ? '0.8' : '';
    }

    const loadingOverlay = document.getElementById('resumeLoadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.classList.toggle('active', isProcessing);
      loadingOverlay.setAttribute('aria-hidden', (!isProcessing).toString());
    }
  }

  function initializeResumeUpload() {
    const dropZone = document.getElementById('dropZone');
    const resumeFile = document.getElementById('resumeFile');
    if (!dropZone || !resumeFile) return;

    resumeFile.onchange = (e) => {
      const file = e.target.files[0];
      if (file) handleResumeUpload(file);
    };

    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    };

    dropZone.ondragleave = () => {
      dropZone.classList.remove('dragover');
    };

    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleResumeUpload(file);
    };
  }

  async function handleResumeUpload(file) {
    const token = getAuthToken();
    if (!token) {
      alert('Please log in to upload a resume.');
      window.location.href = '../auth/signup.html';
      return;
    }

    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only PDF resumes are supported right now.');
      return;
    }

    const formData = new FormData();
    formData.append('resume', file);

    setResumeProcessing(true);

    try {
      const dropZone = document.getElementById('dropZone');
      const originalContent = dropZone ? dropZone.innerHTML : '';

      if (dropZone) {
        dropZone.innerHTML = `
          <div class="upload-loading" style="text-align: center; padding: 20px;">
            <p> Uploading and analyzing resume... </p>
            <p> Calculating match scores for all jobs </p>
          </div>
        `;
      }

      const response = await fetch(`${API_BASE}/api/resume/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to upload resume';
        try {
          const parsedError = JSON.parse(errorText);
          errorMessage = parsedError.error || parsedError.message || errorMessage;
        } catch (_) {
          if (errorText && errorText.trim()) errorMessage = errorText.trim();
        }
        if (response.status === 401 || response.status === 403) {
          PF.clearAuthToken();
          window.location.href = '../auth/signup.html';
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(errorMessage);
      }

      await core.fetchMatchScores();
      const matchCount = Object.keys(state.matchScore).length;

      if (dropZone) {
        dropZone.innerHTML = `
          <div class="upload-success">
            <p>Resume Uploaded!</p>
            <p>Matched against ${matchCount} jobs</p>
          </div>
        `;
      }

      const actionButtonsContainer = document.getElementById('resumeActionButtons');
      if (actionButtonsContainer) actionButtonsContainer.style.display = 'flex';

      window.PathfinderFinderCore.fetchJobs(state.currentQuery, state.currentPage, state.currentFilters);
    } catch (err) {
      console.error('Error uploading resume', err);
      alert(`Failed to upload resume: ${err.message}`);
      const dropZone = document.getElementById('dropZone');
      if (dropZone) dropZone.innerHTML = originalContent;
      initializeResumeUpload();
    } finally {
      setResumeProcessing(false);
    }
  }

  async function removeResume() {
    const token = getAuthToken();
    if (!token) {
      alert('Please log in to remove a resume.');
      return;
    }

    if (!confirm('Are you sure you want to remove your resume? This will clear all match scores.')) return;

    setResumeProcessing(true);
    try {
      const response = await fetch(`${API_BASE}/api/resume/remove`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to remove resume';
        try {
          const parsedError = JSON.parse(errorText);
          errorMessage = parsedError.error || parsedError.message || errorMessage;
        } catch (_) {
          if (errorText && errorText.trim()) errorMessage = errorText.trim();
        }
        if (response.status === 401 || response.status === 403) {
          PF.clearAuthToken();
          window.location.href = '../auth/signup.html';
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(errorMessage);
      }

      state.hasResume = false;
      state.matchScore = {};

      const dropZone = document.getElementById('dropZone');
      const actionButtonsContainer = document.getElementById('resumeActionButtons');
      if (dropZone) {
        dropZone.innerHTML = `
          <div class="file-input-container">
            <input type="file" id="resumeFile" accept=".pdf,application/pdf" required />
            <div class="upload-trigger">
              <span class="upload-icon">??</span>
              <span>Drop your resume here or click to upload</span>
            </div>
            <p class="file-types">Supported format: PDF</p>
          </div>
        `;
        initializeResumeUpload();
      }
      if (actionButtonsContainer) actionButtonsContainer.style.display = 'none';

      await core.fetchMatchScores();
      window.PathfinderFinderCore.fetchJobs(state.currentQuery, state.currentPage, state.currentFilters);
    } catch (err) {
      console.error('Error removing resume', err);
      alert(`Failed to remove resume: ${err.message}`);
    } finally {
      setResumeProcessing(false);
    }
  }

  window.PathfinderFinderResume = {
    initializeResumeUpload,
    removeResume,
    saveJobToTracker,
    preventCountRefetch: false,
    fetchMatchScoresUI: core.fetchMatchScores,
    // used by cards overlay
    saveJobToTracker
  };
})();

