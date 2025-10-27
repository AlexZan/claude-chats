const fs = require('fs');
const path = require('path');

// Manually implement the extraction logic to debug
const testDataDir = './test-data';
const files = fs.readdirSync(testDataDir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => path.join(testDataDir, f));

const sorted = files.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

console.log('\n=== DEBUGGING TITLE EXTRACTION ===\n');

// Check first 10 files
sorted.slice(0, 10).forEach((file, idx) => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const messages = lines.map(l => JSON.parse(l));

  console.log(`\n${idx + 1}. File: ${path.basename(file)}`);
  console.log(`   Total messages: ${messages.length}`);

  // Find first non-sidechain user message
  let foundUserMsg = false;
  let foundAssistantMsg = false;

  for (let i = 0; i < Math.min(messages.length, 20); i++) {
    const msg = messages[i];
    if (msg._metadata) continue;

    const content = msg.message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content) && content[0]?.text) text = content[0].text;

    if (!text.trim()) continue;
    if (/^<(ide_|system-|user-|command-)/.test(text.trim())) continue;

    const label = msg.isSidechain ? 'SIDECHAIN' : 'REAL';

    if (msg.type === 'user' && !msg.isSidechain && !foundUserMsg) {
      console.log(`   ✓ FIRST USER MSG (line ${i+1}): "${text.substring(0, 60)}..."`);
      foundUserMsg = true;
      break;
    }

    if (msg.type === 'assistant' && !msg.isSidechain && !foundAssistantMsg) {
      console.log(`   → First ASSISTANT msg (line ${i+1}): "${text.substring(0, 60)}..."`);
      foundAssistantMsg = true;
    }
  }

  if (!foundUserMsg && foundAssistantMsg) {
    console.log(`   ⚠ NO USER MESSAGE FOUND - using assistant response`);
  }
});
