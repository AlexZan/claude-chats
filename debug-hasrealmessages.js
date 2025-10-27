const fs = require('fs');
const path = require('path');

// Import compiled FileOperations
const { FileOperations } = require('./out/fileOperations');

const testFile = 'C:/Users/Lex/.claude/projects/d--Dev-TaskTick/test-minimal-87d2218d.jsonl';

console.log('\n=== Debug hasRealMessages ===\n');

// Parse the file
const messages = FileOperations.parseConversation(testFile);

console.log(`Total lines: ${messages.length}\n`);

// Examine each message
messages.forEach((line, i) => {
  console.log(`\nLine ${i + 1}:`);
  console.log(`  Type: ${line.type}`);
  console.log(`  isSidechain: ${line.isSidechain}`);

  if (line.message && line.message.content) {
    const content = line.message.content;
    console.log(`  Content type: ${typeof content === 'string' ? 'string' : 'array'}`);

    if (typeof content === 'string') {
      console.log(`  Content: "${content.substring(0, 50)}"`);
    } else if (Array.isArray(content)) {
      console.log(`  Content parts: ${content.length}`);
      content.forEach((part, pi) => {
        if (part.type === 'text') {
          console.log(`    Part ${pi + 1}: "${part.text.substring(0, 50)}"`);
        }
      });
    }
  }
});

// Now test hasRealMessages
console.log('\n\n=== hasRealMessages Test ===\n');
const result = FileOperations.hasRealMessages(testFile);
console.log(`Result: ${result}`);

// Manual check - look for non-sidechain messages
console.log('\n\n=== Manual Non-Sidechain Check ===\n');
let found = false;
messages.forEach((line, i) => {
  if ('_metadata' in line) return;
  if (line.type !== 'user' && line.type !== 'assistant') return;
  if (line.isSidechain) return;

  console.log(`Non-sidechain message at line ${i + 1}:`);
  console.log(`  Type: ${line.type}`);
  console.log(`  Content:`, JSON.stringify(line.message.content));
  found = true;
});

console.log(`\nFound non-sidechain messages: ${found}`);
