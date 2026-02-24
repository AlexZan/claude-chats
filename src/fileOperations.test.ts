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

describe('FileOperations - Metadata Extraction', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('extractFastMetadata (sync)', () => {
    it('should extract title from summary message', () => {
      const content = `{"type":"summary","summary":"Test Conversation Title","leafUuid":"uuid-123"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false,"uuid":"uuid-123"}`;
      const filePath = createTestFile('with-summary.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('Test Conversation Title');
      expect(result.hasRealMessages).toBe(true);
      expect(result.isHidden).toBe(false);
    });

    it('should extract title from first user message when no summary', () => {
      const content = `{"type":"user","message":{"content":"First user message here"},"isSidechain":false,"uuid":"uuid-123"}`;
      const filePath = createTestFile('no-summary.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('First user message here');
      expect(result.hasRealMessages).toBe(true);
    });

    it('should skip warmup summaries', () => {
      const content = `{"type":"summary","summary":"Warmup for assistant readiness","leafUuid":"uuid-1"}
{"type":"summary","summary":"Real Conversation Title","leafUuid":"uuid-2"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false}`;
      const filePath = createTestFile('with-warmup.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('Real Conversation Title');
    });

    it('should detect hasRealMessages=false for warmup-only', () => {
      const content = `{"type":"user","message":{"content":"Warmup"},"isSidechain":true}`;
      const filePath = createTestFile('warmup-only-metadata.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.hasRealMessages).toBe(false);
    });

    it('should detect isHidden=true for cross-file summary', () => {
      const content = `{"type":"summary","summary":"Linked Conversation","leafUuid":"external-uuid-999"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false,"uuid":"uuid-123"}`;
      const filePath = createTestFile('hidden-conversation.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.isHidden).toBe(true);
    });

    it('should detect isHidden=false for local summary', () => {
      const content = `{"type":"summary","summary":"Local Conversation","leafUuid":"uuid-123"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false,"uuid":"uuid-123"}`;
      const filePath = createTestFile('local-conversation.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.isHidden).toBe(false);
    });

    it('should return Untitled for empty file', () => {
      const filePath = createTestFile('empty-metadata.jsonl', '');

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('Untitled');
      expect(result.hasRealMessages).toBe(false);
      expect(result.isHidden).toBe(false);
    });

    it('should truncate long user message to 100 chars', () => {
      const longMessage = 'A'.repeat(150);
      const content = `{"type":"user","message":{"content":"${longMessage}"},"isSidechain":false}`;
      const filePath = createTestFile('long-message.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toHaveLength(100);
      expect(result.title).toBe('A'.repeat(100));
    });

    it('should handle multiline user message (take first line)', () => {
      const content = `{"type":"user","message":{"content":"First line\\nSecond line\\nThird line"},"isSidechain":false}`;
      const filePath = createTestFile('multiline.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('First line');
    });

    it('should handle malformed JSON gracefully', () => {
      const filePath = createTestFile('malformed-metadata.jsonl', '{invalid json}');

      const result = FileOperations.extractFastMetadata(filePath);

      expect(result.title).toBe('Untitled');
      expect(result.hasRealMessages).toBe(false);
    });

    it('should only read first 10 lines (performance optimization)', () => {
      // Create a file with summary at line 11 (should be skipped)
      const lines = [];
      for (let i = 0; i < 10; i++) {
        lines.push(`{"type":"user","message":{"content":"Line ${i}"},"isSidechain":true}`);
      }
      lines.push(`{"type":"summary","summary":"This should be ignored","leafUuid":"uuid-999"}`);

      const content = lines.join('\n');
      const filePath = createTestFile('beyond-10-lines.jsonl', content);

      const result = FileOperations.extractFastMetadata(filePath);

      // Should use first user message, not the summary at line 11
      expect(result.title).toBe('Line 0');
    });
  });

  describe('extractFastMetadataAsync (async)', () => {
    it('should extract title from summary message', async () => {
      const content = `{"type":"summary","summary":"Async Test Title","leafUuid":"uuid-123"}
{"type":"user","message":{"content":"Hello"},"isSidechain":false}`;
      const filePath = createTestFile('async-summary.jsonl', content);

      const result = await FileOperations.extractFastMetadataAsync(filePath);

      expect(result.title).toBe('Async Test Title');
      expect(result.hasRealMessages).toBe(true);
    });

    it('should produce same result as sync version', async () => {
      const content = `{"type":"summary","summary":"Consistency Test","leafUuid":"uuid-123"}
{"type":"user","message":{"content":"Test message"},"isSidechain":false,"uuid":"uuid-123"}`;
      const filePath = createTestFile('sync-async-metadata.jsonl', content);

      const syncResult = FileOperations.extractFastMetadata(filePath);
      const asyncResult = await FileOperations.extractFastMetadataAsync(filePath);

      // Async version returns fewer fields (no isHidden/messageCount for performance)
      expect(asyncResult.title).toBe(syncResult.title);
      expect(asyncResult.hasRealMessages).toBe(syncResult.hasRealMessages);
    });

    it('should handle empty file asynchronously', async () => {
      const filePath = createTestFile('empty-async-metadata.jsonl', '');

      const result = await FileOperations.extractFastMetadataAsync(filePath);

      expect(result.title).toBe('Untitled');
      expect(result.hasRealMessages).toBe(false);
    });
  });

  describe('buildConversationObject', () => {
    it('should build conversation object with all required fields', () => {
      const testFile = 'test-conv.jsonl';
      const testPath = path.join(TEST_DIR, testFile);
      const content = `{"type":"summary","summary":"Test Conv","leafUuid":"uuid-1"}`;
      fs.writeFileSync(testPath, content);

      const stats = fs.statSync(testPath);
      const metadata = { title: 'Test Conv', hasRealMessages: true, isHidden: false };

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.buildConversationObject(
        testFile,
        testPath,
        'test-project',
        stats,
        metadata,
        false
      );

      expect(result.id).toBe('test-conv');
      expect(result.title).toBe('Test Conv');
      expect(result.filePath).toBe(testPath);
      expect(result.project).toBe('test-project');
      expect(result.lastModified).toEqual(stats.mtime);
      expect(result.lastMessageTime).toEqual(stats.mtime);
      expect(result.messageCount).toBeUndefined(); // Computed on-demand, not during fast load
      expect(result.isArchived).toBe(false);
      expect(result.hasRealMessages).toBe(true);
      expect(result.isHidden).toBe(false);
    });

    it('should set isArchived=true when specified', () => {
      const testFile = 'archived-conv.jsonl';
      const testPath = path.join(TEST_DIR, testFile);
      const content = `{"type":"summary","summary":"Archived","leafUuid":"uuid-1"}`;
      fs.writeFileSync(testPath, content);

      const stats = fs.statSync(testPath);
      const metadata = { title: 'Archived', hasRealMessages: true, isHidden: false };

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.buildConversationObject(
        testFile,
        testPath,
        'test-project',
        stats,
        metadata,
        true // isArchived
      );

      expect(result.isArchived).toBe(true);
    });

    it('should handle conversations without real messages', () => {
      const testFile = 'warmup-conv.jsonl';
      const testPath = path.join(TEST_DIR, testFile);
      const content = `{"type":"user","message":{"content":"Warmup"},"isSidechain":true}`;
      fs.writeFileSync(testPath, content);

      const stats = fs.statSync(testPath);
      const metadata = { title: 'Warmup Only', hasRealMessages: false, isHidden: false };

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.buildConversationObject(
        testFile,
        testPath,
        'test-project',
        stats,
        metadata,
        false
      );

      expect(result.hasRealMessages).toBe(false);
      expect(result.messageCount).toBeUndefined(); // Computed on-demand, not during fast load
    });

    it('should always set isHidden=false (skipped for performance)', () => {
      const testFile = 'hidden-conv.jsonl';
      const testPath = path.join(TEST_DIR, testFile);
      const content = `{"type":"summary","summary":"Hidden","leafUuid":"external"}`;
      fs.writeFileSync(testPath, content);

      const stats = fs.statSync(testPath);
      const metadata = { title: 'Hidden', hasRealMessages: true, isHidden: true };

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.buildConversationObject(
        testFile,
        testPath,
        'test-project',
        stats,
        metadata,
        false
      );

      // buildConversationObject always returns isHidden: false (detection skipped for performance)
      expect(result.isHidden).toBe(false);
    });

    it('should use file mtime for timestamps', () => {
      const testFile = 'timestamp-test.jsonl';
      const testPath = path.join(TEST_DIR, testFile);
      const content = `{"type":"summary","summary":"Test","leafUuid":"uuid-1"}`;
      fs.writeFileSync(testPath, content);

      const stats = fs.statSync(testPath);
      const metadata = { title: 'Test', hasRealMessages: true, isHidden: false };

      const FileOpsClass = FileOperations as any;
      const result = FileOpsClass.buildConversationObject(
        testFile,
        testPath,
        'test-project',
        stats,
        metadata,
        false
      );

      // Should use mtime for all timestamp fields
      expect(result.lastModified).toEqual(stats.mtime);
      expect(result.lastMessageTime).toEqual(stats.mtime);
      expect(result.actualLastMessageTime).toEqual(stats.mtime);
    });
  });
});

describe('getCurrentProjectName', () => {
  // Mock vscode.workspace.workspaceFolders
  const mockWorkspaceFolders = (fsPath: string) => {
    jest.doMock('vscode', () => ({
      workspace: {
        workspaceFolders: [{ uri: { fsPath } }]
      }
    }), { virtual: true });
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.unmock('vscode');
  });

  describe('path transformation', () => {
    it('should convert forward slashes to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-project');
    });

    it('should convert dots to hyphens', () => {
      mockWorkspaceFolders('/Users/john.doe/project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-john-doe-project');
    });

    it('should convert spaces to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/My Project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-My-Project');
    });

    it('should convert underscores to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/test_project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-test-project');
    });

    it('should convert at symbols to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/@scope/project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob--scope-project');
    });

    it('should convert parentheses to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/project (2024)');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-project--2024-');
    });

    it('should convert brackets to hyphens', () => {
      mockWorkspaceFolders('/Users/bob/project [draft]');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-project--draft-');
    });

    it('should preserve existing hyphens', () => {
      mockWorkspaceFolders('/Users/bob/my-project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-bob-my-project');
    });

    it('should handle comprehensive special characters (empirical test)', () => {
      mockWorkspaceFolders('/Users/noah.rosenfield/Desktop/Varsity Tutors/test_project-v2.0 @alpha (staging) [2024]');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('-Users-noah-rosenfield-Desktop-Varsity-Tutors-test-project-v2-0--alpha--staging---2024-');
    });

    it('should handle Windows drive letters with backslash', () => {
      mockWorkspaceFolders('C:\\Users\\Lex\\project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('c--Users-Lex-project');
    });

    it('should handle Windows drive letters with forward slash', () => {
      mockWorkspaceFolders('C:/Users/Lex/project');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('c--Users-Lex-project');
    });

    it('should handle Windows paths with special characters', () => {
      mockWorkspaceFolders('D:\\Users\\john.doe\\My_Project (staging)');
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBe('d--Users-john-doe-My-Project--staging-');
    });

    it('should return null when no workspace folders', () => {
      jest.doMock('vscode', () => ({
        workspace: {
          workspaceFolders: null
        }
      }), { virtual: true });
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBeNull();
    });

    it('should return null when workspace folders is empty', () => {
      jest.doMock('vscode', () => ({
        workspace: {
          workspaceFolders: []
        }
      }), { virtual: true });
      const { FileOperations } = require('./fileOperations');
      expect(FileOperations.getCurrentProjectName()).toBeNull();
    });
  });
});
