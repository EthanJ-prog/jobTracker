// ========================================
// Job Tracker - Main JavaScript File
// This file handles all the interactive features of our job tracking board
// ========================================

// The website address where our server is running
// We'll use this to save and load job data
const API_BASE_URL = "http://localhost:3000";

// Helper function to talk to our server
// This is like sending a letter to the server asking for information or changes
async function apiCall(endpoint, options ={}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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

// When the webpage first loads, get all saved jobs from the server
// Think of this like opening a filing cabinet and putting all jobs on the board
window.addEventListener('DOMContentLoaded', async() => {
  try {
    const jobs = await apiCall('/jobs')
    console.log('Jobs loaded from the server: ', jobs);
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

// Keep track of which job card is being dragged
// This helps us remember what we're moving and where it came from
let draggedJob = { job: null, sourceColumnId: '' };

// Create a new job card that can be edited, moved, and deleted
// Think of this like creating a digital sticky note for each job
function createJobCard(job) {

  // Create the main container for our job card
  const card = document.createElement('div');
  card.className = 'job-card';
  card.setAttribute('draggable', 'true'); // Makes it moveable
  card.setAttribute('data-job-id', job.id);

  // Add the job title at the top of the card
  // Like writing the job title at the top of a sticky note
  const titleSpan = document.createElement('span');
  titleSpan.className = 'job-title';
  titleSpan.textContent = job.title;
  card.appendChild(titleSpan);

  // Create two views for the card:
  // 1. Display view - what you normally see
  // 2. Edit view - appears when you click "Edit"
  const displayDiv = document.createElement('div');
  displayDiv.className = 'job-details';
  const dateLabel = job.status === 'saved' ? 'Date Saved: ' : 'Date Applied: ';
  displayDiv.innerHTML = `
    <div><strong>Company:</strong> ${job.company || ''}</div>
    <div><strong>${dateLabel}:</strong> ${job.date || ''}</div>
    <div><strong>Job Link:</strong> <a href="${job.link || '#'}" target="_blank" class="job-link">${job.link ? 'View Job Posting' : 'No link'}</a></div> 
    <div><strong>Notes:</strong> ${job.notes || ''}</div>
  `;

  // Edit mode has input fields for changing job details
  // Like turning our sticky note into a form we can edit
  const editDiv = document.createElement('div');
  editDiv.className = 'job-details';
  editDiv.style.display = 'none'; // Hidden until user clicks "Edit"
  editDiv.innerHTML = `
    <label><strong>Position:</strong><br><input type="text" class="edit-title" value="${job.title || ''}" /></label><br>
    <label><strong>Company:</strong><br><input type="text" class="edit-company" value="${job.company || ''}" /></label><br>
    <label><strong>Applied:</strong><br><input type="date" class="edit-date" value="${job.date || ''}" /></label><br>
    <label><strong>Link:</strong><br><input type="url" class="edit-link" value="${job.link || ''}" /></label><br>
    <label><strong>Notes:</strong><br><textarea class="edit-notes">${job.notes || ''}</textarea></label><br>
    <button class="update-button">Update</button>
    <button class="cancel-button">Cancel</button>
  `;

  // Add buttons to edit and delete the job
  // These let us modify or remove jobs from our board
  const editButton = document.createElement('button');
  editButton.textContent = 'Edit';
  editButton.className = 'edit-button';
  editButton.addEventListener('click', (e) => {
    e.stopPropagation();
    displayDiv.style.display = 'none';
    editDiv.style.display = 'block';
  });
  displayDiv.appendChild(editButton);

  // Append display and edit sections to card
  card.appendChild(displayDiv);
  card.appendChild(editDiv);

  // Prevent clicks on buttons from triggering card click events
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
  });

  // -------------------
  // Delete button
  // -------------------
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

  // Handle what happens when we save changes to a job
  // This updates both the display and saves to the server
  card.querySelector('.update-button').addEventListener('click', async () => {
    try{
      const updatedValues = {
        title: editDiv.querySelector('.edit-title').value.trim(),
        company: editDiv.querySelector('.edit-company').value.trim(),
        date: editDiv.querySelector('.edit-date').value.trim(),
        link: editDiv.querySelector('.edit-link').value.trim(),
        notes: editDiv.querySelector('.edit-notes').value.trim(),
        status: job.status
      };
      await apiCall(`/jobs/${job.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedValues)
      });
      Object.assign(job, updatedValues);
      titleSpan.textContent = job.title;
      const dateLabel = job.status === 'saved' ? 'Date Saved: ' : 'Date Applied: ';
      displayDiv.innerHTML = `
        <div><strong>Company:</strong> ${job.company || ''}</div>
        <div><strong>${dateLabel}</strong> ${job.date || ''}</div>
        <div><strong>Job Link:</strong> <a href="${job.link || '#'}" target="_blank" class="job-link">${job.link ? 'View Job Posting' : 'No link'}</a></div> 
        <div><strong>Notes:</strong> ${job.notes || ''}</div>
      `;
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

  // -------------------
  // Cancel button logic — restores original values and switches back to display mode
  // -------------------
  card.querySelector('.cancel-button').addEventListener('click', () => {
    editDiv.querySelector('.edit-title').value = job.title || '';
    editDiv.querySelector('.edit-company').value = job.company || '';
    editDiv.querySelector('.edit-date').value = job.date || '';
    editDiv.querySelector('.edit-link').value = job.link || '';
    editDiv.querySelector('.edit-notes').value = job.notes || '';
    editDiv.style.display = 'none';
    displayDiv.style.display = 'block';
  });

  // Set up drag and drop so we can move jobs between columns
  // This lets us update a job's status by dragging it
  card.addEventListener('dragstart', () => {
    draggedJob.job = job;
    draggedJob.sourceColumnId = card.closest('.column').id;
  });

  return card;
}

// Make our columns accept dragged job cards
// This lets us drop jobs into different status columns
document.querySelectorAll('.column-content').forEach(container => {
  container.addEventListener('dragover', event => {
    event.preventDefault();
    container.classList.add('drag-over'); // Visual cue for drop target
  });

  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', async () => {
    container.classList.remove('drag-over');
    const targetColumn = container.closest('.column');
    const targetColumnID = targetColumn.id;

    // Prevent dropping if no job is being dragged or dropping into same column
    if (!draggedJob.job) return;
    if (draggedJob.sourceColumnId == targetColumnID) return;

    try {
      await apiCall(`/jobs/${draggedJob.job.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...draggedJob.job,
          status: targetColumnID
        })
      });

      draggedJob.job.status = targetColumnID;

      const newJobCard = createJobCard(draggedJob.job);
      container.insertBefore(newJobCard, container.querySelector('.input-wrapper'));

      const sourceColumn = document.getElementById(draggedJob.sourceColumnId);
      const cards = sourceColumn.querySelectorAll('.job-card');
      for (let card of cards) {
        if (card.getAttribute('data-job-id') == draggedJob.job.id){
          card.remove();
          break;
        }
      }

      console.log(`${draggedJob.job.id} moved from ${draggedJob.sourceColumnId} to ${targetColumnID}`);
    } catch (error) {
      console.error('Failed to update job status: ', error);
      alert('Failed to move job');
    }

    // Reset dragged job tracking
    draggedJob = { job: null, sourceColumnId: '' };
  });
});

// -------------------
// Toggle the visibility of the Add Job form
// -------------------
document.querySelectorAll('.add-button').forEach(button => {
  button.addEventListener('click', () => {
    const wrapper = button.previousElementSibling.querySelector('.input-wrapper');
    const isHidden = wrapper.style.display === 'none' || wrapper.style.display === '';

    if (isHidden) {
      // Show input form and switch to "Cancel"
      wrapper.style.display = 'flex';
      button.textContent = 'Cancel';
    } else {
      // Hide input form and switch back to "Add Job"
      wrapper.style.display = 'none';
      button.textContent = 'Add Job';
    }
  });
});

// -------------------
// Submit button logic — adds a new job to a column
// -------------------
document.querySelectorAll('.submit-button').forEach(button => {
  button.addEventListener('click', async () => {
    const columnID = button.getAttribute('data-column');
    const inputWrapper = button.parentElement;

    // Get values from input fields
    const title = inputWrapper.querySelector('.job-title').value.trim();
    const company = inputWrapper.querySelector('.company-name').value.trim();
    const date = inputWrapper.querySelector('.date-applied').value.trim();
    const link = inputWrapper.querySelector('.job-link').value.trim();
    const notes = inputWrapper.querySelector('.job-notes')?.value.trim() || '';

    if (title === '') return; // Require a title

    const jobData = {title, company, date, link, notes, status: columnID};

    try {
      const response = await apiCall('/jobs', {
        method: 'POST',
        body: JSON.stringify(jobData)
      });
      const completeJob = {
        id: response.id,
        title: jobData.title,
        company: jobData.company,
        date: jobData.date,
        link: jobData.link,
        notes: jobData.notes,
        status: jobData.status
      }
      const newJobInput = createJobCard(completeJob);
      const column = document.getElementById(columnID);
      column.querySelector('.column-content').insertBefore(newJobInput, column.querySelector('.input-wrapper'));

      inputWrapper.querySelector('.job-title').value = '';
      inputWrapper.querySelector('.company-name').value = '';
      inputWrapper.querySelector('.date-applied').value = '';
      inputWrapper.querySelector('.job-link').value = '';
      if (inputWrapper.querySelector('.job-notes')) {
        inputWrapper.querySelector('.job-notes').value = '';

      }
      button.parentElement.style.display = 'none';

      const addButton = column.querySelector('.add-button');
      addButton.textContent = 'Add Job';
    } catch (error) {
      console.error('Failed to create job:', error);
      alert('Failed to create job card, please try again');
    }

  });
});
// Get the menu elements
const hamburgerBtn = document.getElementById('hamburgerToggle');
const navBar = document.getElementById('nav-bar');

// Toggle menu when hamburger is clicked
hamburgerBtn.addEventListener('click', () => {
    navBar.classList.toggle('is-active');
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!navBar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        navBar.classList.remove('is-active');
    }
});

// Close menu when escape key is pressed
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        navBar.classList.remove('is-active');
    }
});