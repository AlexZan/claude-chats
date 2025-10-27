const fs = require('fs');
const path = require('path');
const {FileOperations} = require('./out/fileOperations');

const apiFiles = [
  './test-data/6b3de500-c6fc-4139-832f-3af3ed95474d.jsonl',
  './test-data/d724fad1-3bf7-478c-be5c-a673fc2bbb74.jsonl',
  './test-data/e3f197a0-b26a-4f92-b707-37c5c9abfea6.jsonl'
];

console.log('Checking linkage between API Error conversations:\n');

// Get UUIDs from each file
const fileData = {};
apiFiles.forEach(f => {
  const basename = path.basename(f);
  const messages = FileOperations.parseConversation(f);
  const uuids = new Set();
  const summaries = [];

  messages.forEach(msg => {
    if ('uuid' in msg) {
      uuids.add(msg.uuid);
    }
    if (msg.type === 'summary') {
      summaries.push({
        summary: msg.summary,
        leafUuid: msg.leafUuid
      });
    }
  });

  fileData[basename] = { uuids, summaries, messageCount: messages.length };
});

// Check for shared UUIDs
console.log('=== Checking for shared UUIDs ===\n');
const files = Object.keys(fileData);
for (let i = 0; i < files.length; i++) {
  for (let j = i + 1; j < files.length; j++) {
    const file1 = files[i];
    const file2 = files[j];
    const shared = [...fileData[file1].uuids].filter(uuid => fileData[file2].uuids.has(uuid));

    if (shared.length > 0) {
      console.log(`${file1} and ${file2}:`);
      console.log(`  Shared UUIDs: ${shared.length}`);
      console.log(`  First few: ${shared.slice(0, 3).join(', ')}`);
      console.log('');
    }
  }
}

// Check summaries with leafUuid
console.log('\n=== Summaries and leafUuids ===\n');
files.forEach(f => {
  console.log(`${f}:`);
  console.log(`  Messages: ${fileData[f].messageCount}`);
  if (fileData[f].summaries.length > 0) {
    fileData[f].summaries.forEach(s => {
      console.log(`  Summary: "${s.summary}"`);
      console.log(`  LeafUuid: ${s.leafUuid}`);

      // Check which file contains this leafUuid
      files.forEach(otherFile => {
        if (otherFile !== f && fileData[otherFile].uuids.has(s.leafUuid)) {
          console.log(`    -> Points to message in: ${otherFile}`);
        }
      });
    });
  } else {
    console.log('  No summaries');
  }
  console.log('');
});
