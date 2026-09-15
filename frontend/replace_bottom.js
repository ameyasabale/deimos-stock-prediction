const fs = require('fs');

const file = 'c:/Users/M.P/Downloads/nextjs_sidebyside/app/page.js';
const content = fs.readFileSync(file, 'utf8');
const anchor = '// ─── MINI MARKET TICKER ──────────────────────────────────';
const anchorIdx = content.indexOf(anchor);

if (anchorIdx === -1) {
    console.error('Anchor not found');
    process.exit(1);
}

const topHalf = content.substring(0, anchorIdx);
const bottomText = fs.readFileSync('c:/Users/M.P/Downloads/nextjs_sidebyside/bottom.txt', 'utf8');

fs.writeFileSync(file, topHalf + bottomText);
console.log('Successfully replaced bottom half.');
