window.addEventListener('DOMContentLoaded', () => {
    const savedData = JSON.parse(localStorage.getItem('jobData')) || {};
    for (const columnID in savedData) {
        const column = document.getElementById(columnID);
        const jobs = savedData[columnID];
        jobs.forEach(job => {
        const jobCard = createJobCard(job);
        column.querySelector('.column-content').insertBefore(jobCard, column.querySelector('.input-wrapper'));
     });
    }
});

let draggedJob = { job: null, sourceColumnId: ''};

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('draggable', 'true');

    const titleSpan = document.createElement('span');
    titleSpan.textContent = job.title;
    card.appendChild(titleSpan);

    const displayDiv = document.createElement('div');
    displayDiv.className = 'job-details';
    displayDiv.innerHTML = `
      <div><strong>Company:</strong> ${job.company || 'N/A'}</div>
      <div><strong>Date Applied:</strong> ${job.date || 'N/A'}</div>
      <div><strong>Job Link:</strong> <a href = "${job.link || '#'}" target = "_blank"> ${job.link || 'N/A'}</a></div>
      <div><strong>Notes:</strong> ${job.notes || 'N/A'}</div>
    `; 

    const editDiv = document.createElement('div')
    editDiv.className = 'job-details';
    editDiv.style.display = 'none';
    editDiv.innerHTML = `
      <label><strong>Position:</strong><br><input type = "text" class = "edit-title" value = "${job.title || ''}" /></label><br>
      <label><strong>Company:</strong><br><input type = "text" class = "edit-company" value = "${job.company || ''}" /></label><br>
      <label><strong>Applied:</strong><br><input type = "date" class = "edit-date" value = "${job.date || ''}" /></label><br>
      <label><strong>Link:</strong><br><input type = "url" class = "edit-link" value = "${job.link || ''}" /></label><br>
      <label><strong>Notes:</strong><br><textarea class = "edit-notes">${job.notes || ''}</textarea></label><br>
      <button class = "update-button">Update</button>
    `;

    card.appendChild(displayDiv);
    card.appendChild(editDiv);

    card.addEventListener('click', (e) => {
     if (e.target.closest('button')) return;
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'X';
    deleteButton.addEventListener('click', () => {
      const column = card.closest('.column');
      const columnId = column.id;
      card.remove();
      removeJobLocalStorage(job.title, columnId);
    });

    card.appendChild(deleteButton);

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'edit-button';
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      displayDiv.style.display = 'none';
      editDiv.style.display = 'block';
    });

    card.appendChild(editButton);

    card.addEventListener('dragstart', () =>{
         draggedJob.job = job;
         draggedJob.sourceColumnId = card.closest('.column').id;
    });

    return card;
}


document.querySelectorAll('.column-content').forEach(container => {
  container.addEventListener('dragover', event => {
  event.preventDefault();
  container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', () => {
    container.classList.remove('drag-over');
    const targetColumn = container.closest('.column');
    const targetColumnID = targetColumn.id;
    if(!draggedJob.job) return;
    if(draggedJob.sourceColumnId == targetColumnID) return;

    const sourceColumn = document.getElementById(draggedJob.sourceColumnId);
    const cards = sourceColumn.querySelectorAll('.job-card');
    for(let card of cards){
      if (card.querySelector('span')?.textContent === draggedJob.job.title) {
        card.remove();
        break;
      }
    }
    removeJobLocalStorage(draggedJob.title, draggedJob.sourceColumnId);
    const newCard = createJobCard(draggedJob.job);
    container.insertBefore(newCard, container.querySelector('.input-wrapper'));
    saveJobToLocalStorage(draggedJob.title, targetColumnID);
    draggedJob = {job: null, sourceColumnId: ''};


  });

});

function removeJobLocalStorage(title, columnId){
    const data = JSON.parse(localStorage.getItem('jobData')) || {};
    if (!data[columnId]) return;
    data[columnId] = data[columnId].filter(item => item.title !== title);
    localStorage.setItem('jobData', JSON.stringify(data));
}

document.querySelectorAll('.add-button').forEach(button => {
  button.addEventListener('click', () => {
    const wrapper = button.previousElementSibling.querySelector('.input-wrapper');
    wrapper.style.display = wrapper.style.display === 'none' ? 'flex' : 'none';
  });
});

document.querySelectorAll('.submit-button').forEach(button => {
  button.addEventListener('click', () => {
    const columnID = button.getAttribute('data-column');
    const input = button.previousElementSibling;
    const jobTitle = input.value.trim();
    if (jobTitle === '') return;

    newJobInput = createJobCard(jobTitle);

    const column = document.getElementById(columnID);
    column.querySelector('.column-content').insertBefore(newJobInput, column.querySelector('.input-wrapper'));

    saveJobToLocalStorage(jobTitle, columnID);

    input.value = '';
    button.parentElement.style.display = 'none';
  });
});

function saveJobToLocalStorage(job, columnID) {
    const data = JSON.parse(localStorage.getItem('jobData')) || {};
    if (!data[columnID]) {
        data[columnID] = [];
    }
    data[columnID].push(job);
    localStorage.setItem('jobData', JSON.stringify(data));
}

function updateJobInLocalStorage(title, columnId, updatedJob) {
    // Load existing job data from localStorage, store this in data variable; if null, set it to {}
    const data = JSON.parse(localStorage.getItem('jobData')) || {};

    // If data doesn't have columnId key, return
    if (!data[columnId]) return;

    // Find the index of the job with matching title in the column
    const jobIndex = data[columnId].findIndex(job => job.title === title);

    // If the job was found
    if (jobIndex !== -1) {
        // Replace the job at that position with the updated job data
        data[columnId][jobIndex] = updatedJob;

        // Save the updated data back to local storage
        localStorage.setItem('jobData', JSON.stringify(data));
    }
}
