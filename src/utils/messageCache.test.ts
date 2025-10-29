import { messageCache } from './messageCache';
import { ConversationLine, ConversationMessage } from '../types';

describe('MessageCache', () => {
  // Helper to create test messages
  function createMessage(uuid: string): ConversationMessage {
    return {
      type: 'user',
      message: {
        role: 'user',
        content: 'Test message'
      },
      uuid,
      parentUuid: null,
      isSidechain: false,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session'
    };
  }

  beforeEach(() => {
    messageCache.clear();
  });

  describe('get/set', () => {
    it('should store and retrieve messages', () => {
      const filePath = 'C:\\Users\\test\\conversation.jsonl';
      const messages: ConversationLine[] = [
        createMessage('msg-1'),
        createMessage('msg-2')
      ];
      const mtime = Date.now();

      messageCache.set(filePath, messages, mtime);
      const cached = messageCache.get(filePath, mtime);

      expect(cached).toEqual(messages);
      expect(cached).toBe(messages); // Same reference
    });

    it('should return null for cache miss', () => {
      const cached = messageCache.get('C:\\nonexistent.jsonl', Date.now());
      expect(cached).toBeNull();
    });

    it('should return null for stale cache (mtime mismatch)', () => {
      const filePath = 'C:\\Users\\test\\conversation.jsonl';
      const messages: ConversationLine[] = [createMessage('msg-1')];
      const oldMtime = Date.now() - 10000;
      const newMtime = Date.now();

      messageCache.set(filePath, messages, oldMtime);
      const cached = messageCache.get(filePath, newMtime);

      expect(cached).toBeNull();
      expect(messageCache.size()).toBe(1); // Entry remains (not auto-removed)
    });

    it('should handle path normalization (Windows)', () => {
      const messages: ConversationLine[] = [createMessage('msg-1')];
      const mtime = Date.now();

      messageCache.set('C:\\Users\\Test\\file.jsonl', messages, mtime);

      // Different casing and separators
      const cached1 = messageCache.get('c:\\users\\test\\file.jsonl', mtime);
      const cached2 = messageCache.get('C:/Users/Test/file.jsonl', mtime);
      const cached3 = messageCache.get('c:/users/test/FILE.jsonl', mtime);

      expect(cached1).toEqual(messages);
      expect(cached2).toEqual(messages);
      expect(cached3).toEqual(messages);
    });

    it('should handle Unix paths', () => {
      const messages: ConversationLine[] = [createMessage('msg-1')];
      const mtime = Date.now();

      messageCache.set('/home/user/conversation.jsonl', messages, mtime);
      const cached = messageCache.get('/home/user/conversation.jsonl', mtime);

      expect(cached).toEqual(messages);
    });
  });

  describe('invalidate', () => {
    it('should remove specific cache entry', () => {
      const filePath1 = 'C:\\Users\\test\\conv1.jsonl';
      const filePath2 = 'C:\\Users\\test\\conv2.jsonl';
      const messages1: ConversationLine[] = [createMessage('msg-1')];
      const messages2: ConversationLine[] = [createMessage('msg-2')];
      const mtime = Date.now();

      messageCache.set(filePath1, messages1, mtime);
      messageCache.set(filePath2, messages2, mtime);

      expect(messageCache.size()).toBe(2);

      messageCache.invalidate(filePath1);

      expect(messageCache.size()).toBe(1);
      expect(messageCache.get(filePath1, mtime)).toBeNull();
      expect(messageCache.get(filePath2, mtime)).toEqual(messages2);
    });

    it('should handle path normalization when invalidating', () => {
      const messages: ConversationLine[] = [createMessage('msg-1')];
      const mtime = Date.now();

      messageCache.set('C:\\Users\\Test\\file.jsonl', messages, mtime);

      // Invalidate with different casing/separators
      messageCache.invalidate('c:/users/test/file.jsonl');

      expect(messageCache.get('C:\\Users\\Test\\file.jsonl', mtime)).toBeNull();
    });

    it('should not throw when invalidating non-existent entry', () => {
      expect(() => {
        messageCache.invalidate('C:\\nonexistent.jsonl');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all cache entries', () => {
      const mtime = Date.now();

      messageCache.set('C:\\conv1.jsonl', [createMessage('msg-1')], mtime);
      messageCache.set('C:\\conv2.jsonl', [createMessage('msg-2')], mtime);
      messageCache.set('C:\\conv3.jsonl', [createMessage('msg-3')], mtime);

      expect(messageCache.size()).toBe(3);

      messageCache.clear();

      expect(messageCache.size()).toBe(0);
    });

    it('should work on empty cache', () => {
      expect(() => {
        messageCache.clear();
      }).not.toThrow();

      expect(messageCache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(messageCache.size()).toBe(0);

      const mtime = Date.now();
      messageCache.set('C:\\conv1.jsonl', [createMessage('msg-1')], mtime);
      expect(messageCache.size()).toBe(1);

      messageCache.set('C:\\conv2.jsonl', [createMessage('msg-2')], mtime);
      expect(messageCache.size()).toBe(2);

      messageCache.invalidate('C:\\conv1.jsonl');
      expect(messageCache.size()).toBe(1);

      messageCache.clear();
      expect(messageCache.size()).toBe(0);
    });
  });

  describe('cache behavior', () => {
    it('should update cache when same file is set again', () => {
      const filePath = 'C:\\Users\\test\\conversation.jsonl';
      const messages1: ConversationLine[] = [createMessage('msg-1')];
      const messages2: ConversationLine[] = [createMessage('msg-2')];
      const mtime1 = Date.now();
      const mtime2 = mtime1 + 1000;

      messageCache.set(filePath, messages1, mtime1);
      messageCache.set(filePath, messages2, mtime2);

      expect(messageCache.size()).toBe(1);
      expect(messageCache.get(filePath, mtime1)).toBeNull(); // Old mtime
      expect(messageCache.get(filePath, mtime2)).toEqual(messages2); // New mtime
    });

    it('should handle empty messages array', () => {
      const filePath = 'C:\\Users\\test\\empty.jsonl';
      const messages: ConversationLine[] = [];
      const mtime = Date.now();

      messageCache.set(filePath, messages, mtime);
      const cached = messageCache.get(filePath, mtime);

      expect(cached).toEqual([]);
      expect(Array.isArray(cached)).toBe(true);
    });

    it('should handle large messages array', () => {
      const filePath = 'C:\\Users\\test\\large.jsonl';
      const messages: ConversationLine[] = [];

      // Create 1000 messages
      for (let i = 0; i < 1000; i++) {
        messages.push(createMessage(`msg-${i}`));
      }

      const mtime = Date.now();
      messageCache.set(filePath, messages, mtime);
      const cached = messageCache.get(filePath, mtime);

      expect(cached).toEqual(messages);
      expect(cached?.length).toBe(1000);
    });
  });
});
