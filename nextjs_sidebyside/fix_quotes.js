const fs = require('fs');
const file = 'app/page.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/I\\\\'ve/g, "I've");

fs.writeFileSync(file, content);
console.log('Fixed quotes!');
