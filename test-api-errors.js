const fs = require('fs');
const path = require('path');
const {FileOperations} = require('./out/fileOperations');

const files = fs.readdirSync('./test-data')
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join('./test-data', f));

console.log('API Error conversations:\n');

files.forEach(f => {
  const title = FileOperations.getConversationTitle(f);
  if (title.includes('API Error')) {
    const basename = path.basename(f);
    const isHidden = FileOperations.isHiddenInClaudeCode(f);
    const lines = fs.readFileSync(f, 'utf-8').split('\n').filter(l => l.trim()).length;

    console.log(`File: ${basename}`);
    console.log(`  Hidden: ${isHidden ? 'YES 👁️‍🗨️' : 'NO'}`);
    console.log(`  Lines: ${lines}`);
    console.log(`  Title: ${title.substring(0, 80)}`);
    console.log('');
  }
});
