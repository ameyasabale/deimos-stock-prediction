const fs = require('fs');
const file = 'c:/Users/M.P/Downloads/nextjs_sidebyside/app/page.js';
let content = fs.readFileSync(file, 'utf8');

// The file literally contains `\`\${color}15\`` which should be ``` `${color}15` ```
content = content.replace(/\\\`\\\$\\{/g, '`${');
content = content.replace(/\\\`/g, '`');
// Also fix \${ to ${
content = content.replace(/\\\$\\{/g, '${');

fs.writeFileSync(file, content);
console.log('Fixed slashes');
