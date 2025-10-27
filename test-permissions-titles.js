const fs = require('fs');
const path = require('path');
const {FileOperations} = require('./out/fileOperations');

const files = fs.readdirSync('./test-data')
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join('./test-data', f))
  .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

console.log('\nFiles with "Permissions" in title:\n');
files.forEach((f, i) => {
  const title = FileOperations.getConversationTitle(f);
  const basename = path.basename(f);
  if (title.includes('Permissions')) {
    console.log(`${i+1}. ${basename}`);
    console.log(`   Title: ${title}\n`);
  }
});
