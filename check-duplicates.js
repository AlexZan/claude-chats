const fs = require('fs');
const path = require('path');
const {FileOperations} = require('./out/fileOperations');

const files = fs.readdirSync('./test-data')
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join('./test-data', f))
  .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

console.log('Files with "Permissions Skill Not Discovered System Registration Issue" title:\n');

files.forEach((f, i) => {
  const title = FileOperations.getConversationTitle(f);
  if (title === 'Permissions Skill Not Discovered System Registration Issue') {
    const basename = path.basename(f);
    const lines = fs.readFileSync(f, 'utf-8').split('\n').filter(l => l.trim()).length;
    console.log(`File: ${basename}`);
    console.log(`  Lines: ${lines} messages`);
    console.log('');
  }
});
