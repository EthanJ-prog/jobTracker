// API configuration for backend communication
const API_BASE = "http://localhost:3000";

/**
 * Generic API call function for making HTTP requests to the backend
 * @param {string} endpoint - The API endpoint to call
 * @param {Object} options - Additional fetch options (method, body, etc.)
 * @returns {Promise<Object>} - Parsed JSON response from the API
 */
async function apiCall(endpoint, options ={}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json'
    }, 
    ...options
  });

  if(!response.ok){
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

// Initialize the job tracker when DOM is loaded
window.addEventListener('DOMContentLoaded', async() => {
  try {
    // Fetch all jobs from the API
    const jobs = await apiCall('/jobs')
    console.log('Jobs loaded from the server: ', jobs);
    
    // Create job cards and place them in appropriate columns
    if (jobs && jobs.length > 0){
      jobs.forEach(job =>{
        const jobCard = createJobCard(job);
        const targetColumn = document.getElementById(job.status);
        targetColumn.querySelector('.column-content').insertBefore(jobCard, targetColumn.querySelector('.input-wrapper'));
      });
    } else {
      console.log('No jobs found in the database');
    }
  } catch (error) {
    console.error('Failed to load jobs from the server: ', error)
    alert('Failed to load jobs from the server, please refresh your page');
  }
});

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
     console.log(`${job.id} was successfully deleted`);
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert('Failed to delete job, please try again');
    }
  });
  card.appendChild(deleteButton);

  // Add update button functionality
  card.querySelector('.update-button').addEventListener('click', async () => {
    try{
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
      console.error('Failed to update job: ', error);
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

// Set up drag and drop functionality for all column containers
document.querySelectorAll('.column-content').forEach(container => {
  // Handle drag over events to allow dropping
  container.addEventListener('dragover', event => {
    event.preventDefault();
    container.classList.add('drag-over');
  });

  // Remove drag over styling when leaving drop zone
  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });

  // Handle drop events to move jobs between columns
  container.addEventListener('drop', async () => {
    container.classList.remove('drag-over');
    const targetColumn = container.closest('.column');
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
      draggedJob.job.status = targetColumnId;

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
      console.error('Failed to update job status: ', error);
      alert('Failed to move job');
    }

    // Reset dragged job state
    draggedJob = { job: null, sourceColumnId: '' };
  });
});

// Set up add job button functionality for all columns
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

// Set up submit button functionality for creating new jobs
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
      
      // Create and add job card to column
      const newJobInput = createJobCard(completeJob);
      const column = document.getElementById(columnId);
      column.querySelector('.column-content').insertBefore(newJobInput, column.querySelector('.input-wrapper'));

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