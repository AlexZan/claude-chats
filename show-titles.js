const fs = require('fs');
const path = require('path');
const { FileOperations } = require('./out/fileOperations');

const testDataDir = './test-data';
const files = fs.readdirSync(testDataDir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join(testDataDir, f));

// Sort by modification time (newest first)
const sorted = files.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

console.log('\n=== ACTUAL EXTRACTED TITLES (sorted by mtime, newest first) ===\n');
sorted.slice(0, 30).forEach((file, i) => {
  const title = FileOperations.getConversationTitle(file);
  const basename = path.basename(file);
  console.log(String(i+1).padStart(2, ' ') + '. "' + title + '"');
});
