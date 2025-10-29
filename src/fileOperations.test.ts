import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileOperations } from './fileOperations';
import type { ConversationLine, ConversationMessage } from './types';

// Test fixtures directory
const TEST_DIR = path.join(os.tmpdir(), 'claude-chats-test');

// Helper to create test files
function createTestFile(filename: string, content: string): string {
  const filePath = path.join(TEST_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// Helper to clean up test files
function cleanupTestFiles() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('FileOperations - Parsing Methods', () => {
  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    cleanupTestFiles();
  });

  describe('parseJSONLContent', () => {
    it('should parse valid JSONL content', () => {
      const content = `{"type":"user","message":{"content":"Hello"}}
{"type":"assistant","message":{"content":"Hi there"}}`;

      // Access private method via type assertion
      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.parseJSONLContent(content, 'test.jsonl');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('user');
      expect(result[1].type).toBe('assistant');
    });

    it('should filter out empty lines', () => {
      const content = `{"type":"user","message":{"content":"Hello"}}

{"type":"assistant","message":{"content":"Hi"}}

`;

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.parseJSONLContent(content, 'test.jsonl');

      expect(result).toHaveLength(2);
    });

    it('should throw error on malformed JSON', () => {
      const content = `{"type":"user","message":{"content":"Hello"}}
{invalid json}`;

      const FileOpsClass = FileOperations as any;

      expect(() => {
        FileOpsClass.parseJSONLContent(content, 'test.jsonl');
      }).toThrow(/Failed to parse line/);
    });

    it('should handle single line', () => {
      const content = `{"type":"summary","summary":"Test conversation"}`;

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.parseJSONLContent(content, 'test.jsonl');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('summary');
    });
  });

  describe('parseConversation (sync)', () => {
    it('should parse a valid conversation file', () => {
      const content = `{"type":"summary","summary":"Test"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false}`;

      const filePath = createTestFile('test.jsonl', content);
      const result = FileOperations.parseConversation(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('summary');
      expect(result[1].type).toBe('user');
    });

    it('should handle empty file', () => {
      const filePath = createTestFile('empty.jsonl', '');
      const result = FileOperations.parseConversation(filePath);

      expect(result).toHaveLength(0);
    });

    it('should throw error on missing file', () => {
      const filePath = path.join(TEST_DIR, 'nonexistent.jsonl');

      expect(() => {
        FileOperations.parseConversation(filePath);
      }).toThrow();
    });
  });

  describe('parseConversationAsync (async)', () => {
    it('should parse a valid conversation file asynchronously', async () => {
      const content = `{"type":"summary","summary":"Test"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false}`;

      const filePath = createTestFile('test-async.jsonl', content);
      const result = await FileOperations.parseConversationAsync(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('summary');
      expect(result[1].type).toBe('user');
    });

    it('should handle empty file asynchronously', async () => {
      const filePath = createTestFile('empty-async.jsonl', '');
      const result = await FileOperations.parseConversationAsync(filePath);

      expect(result).toHaveLength(0);
    });

    it('should throw error on missing file asynchronously', async () => {
      const filePath = path.join(TEST_DIR, 'nonexistent-async.jsonl');

      await expect(
        FileOperations.parseConversationAsync(filePath)
      ).rejects.toThrow();
    });

    it('should produce same result as sync version', async () => {
      const content = `{"type":"summary","summary":"Test"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false}
{"type":"assistant","message":{"content":"Hi"},"isSidechain":false}`;

      const filePath = createTestFile('sync-async-compare.jsonl', content);

      const syncResult = FileOperations.parseConversation(filePath);
      const asyncResult = await FileOperations.parseConversationAsync(filePath);

      expect(syncResult).toEqual(asyncResult);
    });
  });
});

describe('FileOperations - Message Validation', () => {
  describe('checkHasRealMessagesInParsed', () => {
    it('should detect real user messages', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: { content: 'Hello world' },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(true);
    });

    it('should ignore sidechain messages', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: { content: 'Warmup message' },
          isSidechain: true
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should ignore assistant messages', () => {
      const messages: ConversationLine[] = [
        {
          type: 'assistant',
          message: { content: 'Hello' },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should ignore summary messages', () => {
      const messages: ConversationLine[] = [
        {
          type: 'summary',
          summary: 'Test conversation',
          leafUuid: 'test-uuid-123'
        }
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should ignore metadata', () => {
      const messages: ConversationLine[] = [
        {
          _metadata: { key: 'value' }
        } as any
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should ignore system metadata in string content', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: { content: '<ide_selection>Some selected code</ide_selection>' },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should detect real content in array format', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: {
            content: [
              { type: 'text', text: '<system-info>Metadata</system-info>' },
              { type: 'text', text: 'Real user question' }
            ]
          },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(true);
    });

    it('should ignore all-metadata array content', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: {
            content: [
              { type: 'text', text: '<ide_selection>Code</ide_selection>' },
              { type: 'text', text: '<user-prompt>Context</user-prompt>' }
            ]
          },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should handle empty content', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: { content: '' },
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });

    it('should handle missing content', () => {
      const messages: ConversationLine[] = [
        {
          type: 'user',
          message: {},
          isSidechain: false
        } as ConversationMessage
      ];

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.checkHasRealMessagesInParsed(messages);

      expect(result).toBe(false);
    });
  });

  describe('hasRealMessages (sync)', () => {
    it('should return true for file with real messages', () => {
      const content = `{"type":"user","message":{"content":"Hello world"},"isSidechain":false}`;
      const filePath = createTestFile('real-messages.jsonl', content);

      const result = FileOperations.hasRealMessages(filePath);

      expect(result).toBe(true);
    });

    it('should return false for warmup-only file', () => {
      const content = `{"type":"user","message":{"content":"Warmup"},"isSidechain":true}`;
      const filePath = createTestFile('warmup-only.jsonl', content);

      const result = FileOperations.hasRealMessages(filePath);

      expect(result).toBe(false);
    });

    it('should return false for missing file', () => {
      const filePath = path.join(TEST_DIR, 'missing.jsonl');

      const result = FileOperations.hasRealMessages(filePath);

      expect(result).toBe(false);
    });
  });

  describe('hasRealMessagesAsync (async)', () => {
    it('should return true for file with real messages', async () => {
      const content = `{"type":"user","message":{"content":"Hello world"},"isSidechain":false}`;
      const filePath = createTestFile('real-messages-async.jsonl', content);

      const result = await FileOperations.hasRealMessagesAsync(filePath);

      expect(result).toBe(true);
    });

    it('should return false for warmup-only file', async () => {
      const content = `{"type":"user","message":{"content":"Warmup"},"isSidechain":true}`;
      const filePath = createTestFile('warmup-only-async.jsonl', content);

      const result = await FileOperations.hasRealMessagesAsync(filePath);

      expect(result).toBe(false);
    });

    it('should produce same result as sync version', async () => {
      const content = `{"type":"user","message":{"content":"Test message"},"isSidechain":false}`;
      const filePath = createTestFile('sync-async-has-real.jsonl', content);

      const syncResult = FileOperations.hasRealMessages(filePath);
      const asyncResult = await FileOperations.hasRealMessagesAsync(filePath);

      expect(syncResult).toBe(asyncResult);
    });
  });
});
