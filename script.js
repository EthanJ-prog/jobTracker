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

let nextJobID = 1; 

let draggedJob = { job: null, sourceColumnId: ''};

function createJobCard(job) {
    if (!job.id){
     job.id = nextJobID;
    }

    const card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-job-id', job.id);

    const titleSpan = document.createElement('span');
    titleSpan.className ='job-title';
    titleSpan.textContent = job.title;
    card.appendChild(titleSpan);

    const displayDiv = document.createElement('div');
    displayDiv.className = 'job-details';
    displayDiv.innerHTML = `
      <div><strong>Company:</strong> ${job.company || 'N/A'}</div>
      <div><strong>Date Applied:</strong> ${job.date || 'N/A'}</div>
      <div><strong>Job Link:</strong> <a href = "${job.link || '#'}" target = "_blank"> ${job.link || 'N/A'}</a></div>
      <div><strong>Notes:</strong> ${job.notes || ''}</div>
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
      <button class = "cancel-button">Cancel</button>
    `;

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'edit-button';
    editButton.addEventListener('click', (e) => {
      e.stopPropagation();
      displayDiv.style.display = 'none';
      editDiv.style.display = 'block';
    });

    displayDiv.appendChild(editButton);

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
      removeJobLocalStorage(job.id, columnId);
    });

    card.appendChild(deleteButton);

    card.querySelector('.update-button').addEventListener('click', () => {
     const columnId = card.closest('.column').id;
     const originalID = job.id;
     job.title = editDiv.querySelector('.edit-title').value.trim();
     job.company = editDiv.querySelector('.edit-company').value.trim();
     job.date = editDiv.querySelector('.edit-date').value.trim();
     job.link = editDiv.querySelector('.edit-link').value.trim();
     job.notes = editDiv.querySelector('.edit-notes').value.trim();

     titleSpan.textContent = job.title;

     updateJobInLocalStorage(originalID, columnId, job);

     displayDiv.innerHTML = `
       <div><strong>Company:</strong> ${job.company || 'N/A'}</div>
       <div><strong>Date Applied:</strong> ${job.date || 'N/A'}</div>
       <div><strong>Job Link:</strong> <a href="${job.link || '#'}" target="_blank">${job.link || 'N/A'}</a></div>
       <div><strong>Notes:</strong> ${job.notes || 'N/A'}</div>
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
    });

    
    card.querySelector('.cancel-button').addEventListener('click', () =>{
      editDiv.querySelector('.edit-title').value = job.title || '';
      editDiv.querySelector('.edit-company').value = job.company || '';
      editDiv.querySelector('.edit-date').value = job.date || '';
      editDiv.querySelector('.edit-link').value = job.link || '';
      editDiv.querySelector('.edit-notes').value = job.notes || '';
      editDiv.style.display = 'none';
      displayDiv.style.display = 'block';
    });

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
    saveJobToLocalStorage(draggedJob.job, targetColumnID);

    const newCard = createJobCard(draggedJob.job);
    container.insertBefore(newCard, container.querySelector('.input-wrapper'));

    const sourceColumn = document.getElementById(draggedJob.sourceColumnId);
    const cards = sourceColumn.querySelectorAll('.job-card');
    for(let card of cards){
      if (card.getAttribute('data-job-id') == draggedJob.job.id) {
        card.remove();
        break;
      }
    }
    removeJobLocalStorage(draggedJob.job.id, draggedJob.sourceColumnId);
    draggedJob = {job: null, sourceColumnId: ''};


  });

});

function removeJobLocalStorage(jobID, columnId){
    const data = JSON.parse(localStorage.getItem('jobData')) || {};
    if (!data[columnId]) return;
    data[columnId] = data[columnId].filter(item => item && item.id !== jobID);
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
    const inputWrapper = button.parentElement;

    const title = inputWrapper.querySelector('.job-title').value.trim();
    const company = inputWrapper.querySelector('.company-name').value.trim();
    const date = inputWrapper.querySelector('.date-applied').value.trim();
    const link = inputWrapper.querySelector('.job-link').value.trim();
    const notes = inputWrapper.querySelector('.job-notes')?.value.trim() || '';

    if (title === '') return;

    const job = {id: nextJobID++, title, company, date, link, notes};
    const newJobInput = createJobCard(job);

    const column = document.getElementById(columnID);
    column.querySelector('.column-content').insertBefore(newJobInput, column.querySelector('.input-wrapper'));
    saveJobToLocalStorage(job, columnID);

    inputWrapper.querySelector('.job-title').value = '';
    inputWrapper.querySelector('.company-name').value = '';
    inputWrapper.querySelector('.date-applied').value = '';
    inputWrapper.querySelector('.job-link').value = '';
    if (inputWrapper.querySelector('.job-notes')) {
      inputWrapper.querySelector('.job-notes').value = '';
    }
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

function updateJobInLocalStorage(jobID, columnId, updatedJob) {
    const data = JSON.parse(localStorage.getItem('jobData')) || {};

    if (!data[columnId]) {
        return;
    }

    const jobIndex = data[columnId].findIndex(job => job.id === jobID);

    if (jobIndex !== -1) {
        data[columnId][jobIndex] = updatedJob;

        localStorage.setItem('jobData', JSON.stringify(data));
    }
}
