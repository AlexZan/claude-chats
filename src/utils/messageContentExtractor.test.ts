import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MessageContentExtractor } from './messageContentExtractor';
import { ConversationMessage } from '../types';

describe('MessageContentExtractor', () => {
  describe('extractText', () => {
    describe('String content', () => {
      it('should extract simple string content', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: 'Hello world'
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('Hello world');
      });

      it('should filter system metadata when requested', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: '<ide_selection>code here</ide_selection>'
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          filterSystemMetadata: true
        });
        expect(result).toBe('');
      });

      it('should NOT filter system metadata by default', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: '<ide_selection>code here</ide_selection>'
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('<ide_selection>code here</ide_selection>');
      });
    });

    describe('Array content', () => {
      it('should extract text from array items', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'First item' },
              { type: 'text', text: 'Second item' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('First item Second item');
      });

      it('should join with custom separator', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'First item' },
              { type: 'text', text: 'Second item' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          joinWith: '\n\n'
        });
        expect(result).toBe('First item\n\nSecond item');
      });

      it('should return first item only when requested', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'First item' },
              { type: 'text', text: 'Second item' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          returnFirstOnly: true
        });
        expect(result).toBe('First item');
      });

      it('should filter system metadata from array items', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: '<ide_selection>code</ide_selection>' },
              { type: 'text', text: 'Real content' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          filterSystemMetadata: true
        });
        expect(result).toBe('Real content');
      });

      it('should include tool_use blocks when requested', () => {
        const message: ConversationMessage = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me help' },
              { type: 'tool_use', name: 'bash', input: { command: 'ls' } }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          includeToolUse: true,
          joinWith: '\n\n'
        });
        expect(result).toContain('Let me help');
        expect(result).toContain('[Tool: bash]');
        expect(result).toContain('"command": "ls"');
      });

      it('should NOT include tool_use blocks by default', () => {
        const message: ConversationMessage = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me help' },
              { type: 'tool_use', name: 'bash', input: { command: 'ls' } }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('Let me help');
        expect(result).not.toContain('[Tool: bash]');
      });

      it('should skip non-text items', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'First' },
              { type: 'image', url: 'http://example.com/image.png' },
              { type: 'text', text: 'Second' }
            ] as any
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('First Second');
      });
    });

    describe('Edge cases', () => {
      it('should return empty string for missing message', () => {
        const message: any = {
          type: 'user',
          isSidechain: false,
          uuid: 'test-uuid'
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('');
      });

      it('should return empty string for missing content', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: ''
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('');
      });

      it('should return empty string for empty array', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: []
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message);
        expect(result).toBe('');
      });

      it('should return empty string for array with only metadata', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: '<ide_selection>code</ide_selection>' },
              { type: 'text', text: '<system-info>info</system-info>' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          filterSystemMetadata: true
        });
        expect(result).toBe('');
      });
    });

    describe('Use case: Title extraction', () => {
      it('should extract title correctly (first text, filter metadata)', () => {
        const message: ConversationMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: '<ide_selection>some code</ide_selection>' },
              { type: 'text', text: 'Please help me debug this code' },
              { type: 'text', text: 'It is not working' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          filterSystemMetadata: true,
          returnFirstOnly: true
        });
        expect(result).toBe('Please help me debug this code');
      });
    });

    describe('Use case: Viewer display', () => {
      it('should extract viewer content correctly (all text + tools, double newline)', () => {
        const message: ConversationMessage = {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will help you' },
              { type: 'tool_use', name: 'read', input: { file: 'test.ts' } },
              { type: 'text', text: 'The file looks good' }
            ]
          },
          isSidechain: false,
          uuid: 'test-uuid',
          parentUuid: '',
          timestamp: '',
          sessionId: ''
        };

        const result = MessageContentExtractor.extractText(message, {
          includeToolUse: true,
          joinWith: '\n\n'
        });

        expect(result).toContain('I will help you');
        expect(result).toContain('[Tool: read]');
        expect(result).toContain('The file looks good');
        expect(result).toContain('\n\n');
      });
    });
  });

  describe('extractTextFromContent', () => {
    it('should extract from string content', () => {
      const result = MessageContentExtractor.extractTextFromContent('Hello world');
      expect(result).toBe('Hello world');
    });

    it('should extract from array content', () => {
      const content = [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' }
      ];
      const result = MessageContentExtractor.extractTextFromContent(content);
      expect(result).toBe('First Second');
    });

    it('should filter system metadata when requested', () => {
      const result = MessageContentExtractor.extractTextFromContent(
        '<ide_selection>code</ide_selection>',
        { filterSystemMetadata: true }
      );
      expect(result).toBe('');
    });

    it('should support all extraction options', () => {
      const content = [
        { type: 'text', text: 'First' },
        { type: 'tool_use', name: 'bash', input: { cmd: 'ls' } },
        { type: 'text', text: 'Second' }
      ];
      const result = MessageContentExtractor.extractTextFromContent(content, {
        includeToolUse: true,
        joinWith: '\n\n'
      });
      expect(result).toContain('First');
      expect(result).toContain('[Tool: bash]');
      expect(result).toContain('Second');
    });
  });
});
