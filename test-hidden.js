const fs = require('fs');
const path = require('path');
const {FileOperations} = require('./out/fileOperations');

const files = fs.readdirSync('./test-data')
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join('./test-data', f));

console.log('\nChecking which conversations are hidden in Claude Code:\n');

files.forEach((f) => {
  const basename = path.basename(f);
  const isHidden = FileOperations.isHiddenInClaudeCode(f);
  const title = FileOperations.getConversationTitle(f);

  if (basename.includes('97409d9f') || basename.includes('87d2218d')) {
    console.log(`File: ${basename}`);
    console.log(`  Hidden: ${isHidden ? 'YES 👁️‍🗨️' : 'NO'}`);
    console.log(`  Title: ${title}`);
    console.log('');
  }
});
