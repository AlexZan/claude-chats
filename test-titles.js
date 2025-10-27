const fs = require('fs');
const path = require('path');

// Import compiled FileOperations
const { FileOperations } = require('./out/fileOperations');

// Load expected titles from readonly file
const EXPECTED_TITLES = fs.readFileSync(path.join(__dirname, 'expected-titles.txt'), 'utf-8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

const testDataDir = path.join(__dirname, 'test-data');

if (!fs.existsSync(testDataDir)) {
  console.log('ERROR: Test data directory not found');
  process.exit(1);
}

// Get all conversation files
const files = fs.readdirSync(testDataDir)
  .filter(f => f.endsWith('.jsonl') && !f.endsWith('.backup'))
  .map(f => path.join(testDataDir, f));

if (files.length === 0) {
  console.log('ERROR: No test conversation files found');
  process.exit(1);
}

// Sort by last message timestamp (newest first) - this is what Claude Code uses
const sortedFiles = files.sort((a, b) => {
  // Get last message timestamp from each file
  const getLastTimestamp = (file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length === 0) return 0;
      const lastMessage = JSON.parse(lines[lines.length - 1]);
      return new Date(lastMessage.timestamp || 0).getTime();
    } catch {
      return 0;
    }
  };

  const timeA = getLastTimestamp(a);
  const timeB = getLastTimestamp(b);
  return timeB - timeA; // Newest first
});

console.log(`\n=== Testing Title Extraction (${sortedFiles.length} files) ===\n`);

// Extract titles
const extractedTitles = sortedFiles.map((file, index) => {
  const title = FileOperations.getConversationTitle(file);
  return {
    file: path.basename(file),
    title,
    index
  };
});

// Compare with expected - match out of order
console.log('Expected titles:');
EXPECTED_TITLES.forEach((exp, i) => console.log(`  ${i + 1}. ${exp}`));

console.log('\nExtracted titles:');
extractedTitles.forEach((item, i) => console.log(`  ${i + 1}. ${item.title}`));

console.log('\n=== Matching (order-independent) ===\n');

let matches = 0;
const matchedExpected = new Set();
const matchedExtracted = new Set();

// For each extracted title, try to find a match in expected
extractedTitles.forEach((item, extractedIdx) => {
  EXPECTED_TITLES.forEach((expected, expectedIdx) => {
    if (matchedExpected.has(expectedIdx) || matchedExtracted.has(extractedIdx)) {
      return; // Already matched
    }

    // Check if titles match (first 50 chars for flexibility)
    const isMatch =
      item.title.substring(0, 50) === expected.substring(0, 50) ||
      item.title.substring(0, 30) === expected.substring(0, 30) ||
      (item.title.length > 20 && expected.length > 20 &&
       item.title.substring(0, 20) === expected.substring(0, 20));

    if (isMatch) {
      matches++;
      matchedExpected.add(expectedIdx);
      matchedExtracted.add(extractedIdx);
      console.log(`✓ Match found:`);
      console.log(`  Expected #${expectedIdx + 1}: "${expected}"`);
      console.log(`  Extracted #${extractedIdx + 1}: "${item.title}"`);
      console.log(`  File: ${item.file}\n`);
    }
  });
});

const total = Math.min(EXPECTED_TITLES.length, extractedTitles.length);

console.log(`\n=== Results ===`);
console.log(`Matches: ${matches}/${total} (${(matches/total*100).toFixed(1)}%)`);

if (matches < total) {
  console.log('\n=== Unmatched Expected Titles ===');
  EXPECTED_TITLES.forEach((expected, i) => {
    if (!matchedExpected.has(i)) {
      console.log(`  ${i + 1}. "${expected}"`);
    }
  });

  console.log('\n=== Unmatched Extracted Titles ===');
  extractedTitles.forEach((item, i) => {
    if (!matchedExtracted.has(i)) {
      console.log(`  ${i + 1}. "${item.title}" (${item.file})`);
    }
  });
}

if (matches === total) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  process.exit(1);
}
