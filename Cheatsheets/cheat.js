// ================================================
// JavaScript Complete Guide - From Basics to Advanced
// ================================================

// -----------------------------------------
// 1. BASICS & DATA TYPES
// -----------------------------------------

// Logging to console (debugging)
console.log('Basic message');    // Regular log
console.warn('Warning');         // Yellow warning
console.error('Error');          // Red error
console.table(['data']);         // Tabular format

// Variables & Data Types
let name = 'John';              // String (text)
let age = 25;                   // Number (integer)
let price = 99.99;              // Number (decimal)
let isActive = true;            // Boolean (true/false)
let userInfo = {};              // Object (collection of data)
let colors = ['red', 'blue'];   // Array (list)
let nothing = null;             // Null (intentionally empty)
let notDefined;                 // Undefined (not set)

// String Operations (used in job titles, company names)
let text = "Hello World";
text.length;                    // Get length: 11
text.toUpperCase();            // Convert to uppercase
text.toLowerCase();            // Convert to lowercase
text.includes('World');        // Check if contains: true
text.replace('World', 'JS');   // Replace text
text.split(' ');               // Convert to array

// -----------------------------------------
// 2. ARRAYS & OBJECTS (Like our job listings)
// -----------------------------------------

// Array Methods (similar to job listings array)
let jobs = ['Developer', 'Designer', 'Manager'];
jobs.push('Engineer');          // Add to end
jobs.pop();                     // Remove from end
jobs.unshift('Admin');          // Add to start
jobs.shift();                   // Remove from start
jobs.slice(1, 3);              // Get portion of array
jobs.splice(1, 1);             // Remove elements

// Advanced Array Methods (used in job filtering)
let numbers = [1, 2, 3, 4, 5];

// forEach - iterate (like looping through jobs)
numbers.forEach(num => {
    console.log(num);
});

// map - transform items (like formatting job data)
let doubled = numbers.map(num => num * 2);

// filter - create subset (like filtering jobs)
let evenNums = numbers.filter(num => num % 2 === 0);

// reduce - accumulate values (like counting jobs)
let sum = numbers.reduce((total, num) => total + num, 0);

// -----------------------------------------
// 3. DOM MANIPULATION (Used throughout UI)
// -----------------------------------------

// Selecting Elements
document.getElementById('jobCard');         // By ID
document.querySelector('.job-title');       // By CSS selector
document.querySelectorAll('.job-card');     // All matching elements

// Creating Elements (like creating job cards)
const div = document.createElement('div');
div.className = 'job-card';
div.innerHTML = `
    <h3>Job Title</h3>
    <p>Company Name</p>
`;

// Event Handling (like button clicks)
button.addEventListener('click', (event) => {
    event.preventDefault();     // Stop default behavior
    event.stopPropagation();   // Stop event bubbling
});

// -----------------------------------------
// 4. ASYNC PROGRAMMING (API Calls)
// -----------------------------------------

// Promises (like our API calls)
const promise = new Promise((resolve, reject) => {
    if (success) {
        resolve('Data');
    } else {
        reject('Error');
    }
});

// Async/Await (modern way to handle promises)
async function getJobs() {
    try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(error);
    }
}

// -----------------------------------------
// 5. MODERN JAVASCRIPT FEATURES
// -----------------------------------------

// Template Literals (used in HTML templates)
const jobTitle = 'Developer';
const html = `
    <div class="job">
        <h2>${jobTitle}</h2>
    </div>
`;

// Destructuring (used in job data)
const { title, company } = job;
const [first, ...rest] = items;

// Spread Operator (copying arrays/objects)
const jobCopy = { ...job };
const newJobs = [...jobs];

// -----------------------------------------
// 6. LOCAL STORAGE (Saving data)
// -----------------------------------------

// Save data
localStorage.setItem('jobs', JSON.stringify(jobs));

// Get data
const savedJobs = JSON.parse(localStorage.getItem('jobs'));

// -----------------------------------------
// 7. DRAG AND DROP (Job cards movement)
// -----------------------------------------

// Make element draggable
element.setAttribute('draggable', true);

// Drag events
element.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', e.target.id);
});

element.addEventListener('drop', (e) => {
    const id = e.dataTransfer.getData('text/plain');
});

// -----------------------------------------
// 8. ERROR HANDLING
// -----------------------------------------

try {
    // Attempt risky operation
    await saveJob(jobData);
} catch (error) {
    // Handle any errors
    console.error('Failed to save:', error);
} finally {
    // Always runs
    hideLoadingSpinner();
}

// -----------------------------------------
// 9. BEST PRACTICES
// -----------------------------------------

// Use meaningful names
const fetchJobs instead of getData
const isActive instead of flag

// Comment complex logic
// Calculate job application success rate
const successRate = (interviews / applications) * 100;

// Break down complex functions
function processJobApplication(job) {
    validateJobData(job);
    saveToDatabase(job);
    updateUI(job);
}