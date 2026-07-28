const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJobDescription } = require('./jobDescription');

test('converts escaped and real line endings into consistent paragraphs', () => {
    const raw = 'GRADE\\r\\nASTD5\r\n\r\nMain Purpose\\nServe patients.';
    assert.equal(normalizeJobDescription(raw), 'GRADE\nASTD5\n\nMain Purpose\nServe patients.');
});

test('converts common HTML structure and entities to readable plain text', () => {
    const raw = '<h2>Requirements</h2><ul><li>C++ &amp; C#</li><li>5+ years</li></ul><p>Salary: $80,000&nbsp;-&nbsp;$100,000</p>';
    assert.equal(
        normalizeJobDescription(raw),
        'Requirements\n\n- C++ & C#\n- 5+ years\n\nSalary: $80,000 - $100,000'
    );
});

test('normalizes bullets, whitespace, and excessive blank lines', () => {
    const raw = 'Duties\n\n\n •   Write code  \n\t\n* Review code';
    assert.equal(normalizeJobDescription(raw), 'Duties\n\n- Write code\n- Review code');
});

test('joins list markers separated from their content by HTML layout', () => {
    const raw = '<ul><li><p>Manage calendars</p></li><li><div>Prepare reports</div></li></ul>';
    assert.equal(normalizeJobDescription(raw), '- Manage calendars\n- Prepare reports');
});

test('preserves URLs, apostrophes, and technical punctuation', () => {
    const raw = "Apply at https://example.com/jobs?id=42. You'll use C++, C#, and .NET.";
    assert.equal(normalizeJobDescription(raw), raw);
});

test('returns null for empty or invalid descriptions', () => {
    assert.equal(normalizeJobDescription(' \r\n '), null);
    assert.equal(normalizeJobDescription(null), null);
    assert.equal(normalizeJobDescription({}), null);
});

test('is idempotent for already-normalized descriptions', () => {
    const description = 'Role purpose\n\n- Build APIs\n- Review code';
    assert.equal(
        normalizeJobDescription(normalizeJobDescription(description)),
        description
    );
});
