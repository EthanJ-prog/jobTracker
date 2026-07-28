const HTML_ENTITIES = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
};

function decodeHtmlEntities(text) {
    return text.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, value) => {
        const normalizedValue = value.toLowerCase();

        if (normalizedValue.startsWith('#x')) {
            const codePoint = Number.parseInt(normalizedValue.slice(2), 16);
            return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
        }

        if (normalizedValue.startsWith('#')) {
            const codePoint = Number.parseInt(normalizedValue.slice(1), 10);
            return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
        }

        return HTML_ENTITIES[normalizedValue] || entity;
    });
}

/**
 * Convert an API-provided job description into consistently formatted plain text.
 * The function preserves the posting's wording while normalizing markup, escaped
 * line endings, bullets, whitespace, and invisible control characters.
 *
 * @param {unknown} description - Raw job description from an external API
 * @returns {string|null} Normalized plain text, or null when no content remains
 */
function normalizeJobDescription(description) {
    if (typeof description !== 'string' || !description.trim()) return null;

    let normalized = description
        .normalize('NFKC')
        .replace(/\\r\\n|\\n\\r/g, '\n')
        .replace(/\\[rn]/g, '\n')
        .replace(/\\t/g, ' ')
        .replace(/\r\n?|\u2028|\u2029/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '');

    normalized = normalized
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*li\b[^>]*>/gi, '\n- ')
        .replace(/<\s*\/\s*li\s*>/gi, '\n')
        .replace(/<\s*\/\s*(?:p|div|section|article|header|footer|h[1-6]|ul|ol|tr)\s*>/gi, '\n')
        .replace(/<\s*(?:p|div|section|article|header|footer|h[1-6]|ul|ol|tr)\b[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '');

    normalized = decodeHtmlEntities(normalized)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ');

    const lines = normalized.split('\n').map((line) => {
        const cleanedLine = line.replace(/[ \t]+/g, ' ').trim();
        return cleanedLine.replace(/^[•●▪◦‣*]\s*/, '- ').trimEnd();
    });

    // Some HTML list markup places the bullet marker and its text on separate
    // lines. Join those fragments so every list item has a stable "- text" form.
    const joinedBulletLines = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line !== '-') {
            joinedBulletLines.push(line);
            continue;
        }

        let contentIndex = index + 1;
        while (contentIndex < lines.length && !lines[contentIndex]) contentIndex++;
        const content = lines[contentIndex];

        if (content && content !== '-' && !content.startsWith('- ')) {
            joinedBulletLines.push(`- ${content}`);
            index = contentIndex;
        }
    }

    const formattedLines = [];
    for (let index = 0; index < joinedBulletLines.length; index++) {
        const line = joinedBulletLines[index];
        if (!line) {
            let nextIndex = index + 1;
            while (nextIndex < joinedBulletLines.length && !joinedBulletLines[nextIndex]) nextIndex++;
            const previousLine = formattedLines[formattedLines.length - 1];
            const nextLine = joinedBulletLines[nextIndex];
            if (previousLine && previousLine.startsWith('- ') && nextLine && nextLine.startsWith('- ')) {
                continue;
            }
            if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
                formattedLines.push('');
            }
            continue;
        }
        formattedLines.push(line);
    }

    const result = formattedLines.join('\n').trim();
    return result || null;
}

module.exports = {
    decodeHtmlEntities,
    normalizeJobDescription
};
