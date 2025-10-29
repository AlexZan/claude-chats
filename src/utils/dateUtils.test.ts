import { getTimePeriod, groupByTimePeriod, getTimePeriods } from './dateUtils';
import { Conversation } from '../types';

describe('DateUtils', () => {
  describe('getTimePeriod', () => {
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const oneDay = 24 * 60 * 60 * 1000;

    it('should return "Today" for current timestamp', () => {
      expect(getTimePeriod(now)).toBe('Today');
    });

    it('should return "Today" for timestamp at start of today', () => {
      expect(getTimePeriod(todayStart)).toBe('Today');
    });

    it('should return "Yesterday" for timestamp 1 day ago', () => {
      const yesterday = todayStart - oneDay;
      expect(getTimePeriod(yesterday)).toBe('Yesterday');
    });

    it('should return "Past week" for timestamp 3 days ago', () => {
      const threeDaysAgo = todayStart - 3 * oneDay;
      expect(getTimePeriod(threeDaysAgo)).toBe('Past week');
    });

    it('should return "Past week" for timestamp 6 days ago', () => {
      const sixDaysAgo = todayStart - 6 * oneDay;
      expect(getTimePeriod(sixDaysAgo)).toBe('Past week');
    });

    it('should return "Past month" for timestamp 15 days ago', () => {
      const fifteenDaysAgo = todayStart - 15 * oneDay;
      expect(getTimePeriod(fifteenDaysAgo)).toBe('Past month');
    });

    it('should return "Past month" for timestamp 29 days ago', () => {
      const twentyNineDaysAgo = todayStart - 29 * oneDay;
      expect(getTimePeriod(twentyNineDaysAgo)).toBe('Past month');
    });

    it('should return "Older" for timestamp 31 days ago', () => {
      const thirtyOneDaysAgo = todayStart - 31 * oneDay;
      expect(getTimePeriod(thirtyOneDaysAgo)).toBe('Older');
    });

    it('should return "Older" for timestamp 1 year ago', () => {
      const oneYearAgo = todayStart - 365 * oneDay;
      expect(getTimePeriod(oneYearAgo)).toBe('Older');
    });
  });

  describe('groupByTimePeriod', () => {
    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const oneDay = 24 * 60 * 60 * 1000;

    // Helper to create test conversation
    function createConversation(daysAgo: number): Conversation {
      const timestamp = todayStart - daysAgo * oneDay;
      return {
        id: `test-${daysAgo}`,
        title: `Conversation ${daysAgo}`,
        filePath: `test${daysAgo}.jsonl`,
        project: 'test-project',
        lastModified: new Date(timestamp),
        lastMessageTime: new Date(timestamp),
        actualLastMessageTime: new Date(timestamp),
        messageCount: 10,
        fileSize: 1024,
        hasRealMessages: true,
        isArchived: false,
        isHidden: false
      };
    }

    it('should group conversations by time period', () => {
      const conversations = [
        createConversation(0),    // Today
        createConversation(1),    // Yesterday
        createConversation(3),    // Past week
        createConversation(15),   // Past month
        createConversation(60)    // Older
      ];

      const groups = groupByTimePeriod(conversations);

      expect(groups.get('Today')?.length).toBe(1);
      expect(groups.get('Yesterday')?.length).toBe(1);
      expect(groups.get('Past week')?.length).toBe(1);
      expect(groups.get('Past month')?.length).toBe(1);
      expect(groups.get('Older')?.length).toBe(1);
    });

    it('should handle multiple conversations in same period', () => {
      const conversations = [
        createConversation(0),
        createConversation(0),
        createConversation(0)
      ];

      const groups = groupByTimePeriod(conversations);

      expect(groups.get('Today')?.length).toBe(3);
      expect(groups.get('Yesterday')?.length).toBe(0);
    });

    it('should handle empty conversations array', () => {
      const groups = groupByTimePeriod([]);

      expect(groups.get('Today')?.length).toBe(0);
      expect(groups.get('Yesterday')?.length).toBe(0);
      expect(groups.get('Past week')?.length).toBe(0);
      expect(groups.get('Past month')?.length).toBe(0);
      expect(groups.get('Older')?.length).toBe(0);
    });

    it('should initialize all time periods even if empty', () => {
      const conversations = [createConversation(0)]; // Only today

      const groups = groupByTimePeriod(conversations);

      expect(groups.has('Today')).toBe(true);
      expect(groups.has('Yesterday')).toBe(true);
      expect(groups.has('Past week')).toBe(true);
      expect(groups.has('Past month')).toBe(true);
      expect(groups.has('Older')).toBe(true);
    });

    it('should preserve conversation order within groups', () => {
      const conv1 = createConversation(0);
      const conv2 = createConversation(0);
      const conv3 = createConversation(0);
      const conversations = [conv1, conv2, conv3];

      const groups = groupByTimePeriod(conversations);
      const todayGroup = groups.get('Today')!;

      expect(todayGroup[0]).toBe(conv1);
      expect(todayGroup[1]).toBe(conv2);
      expect(todayGroup[2]).toBe(conv3);
    });
  });

  describe('getTimePeriods', () => {
    it('should return all time periods in order', () => {
      const periods = getTimePeriods();

      expect(periods).toEqual([
        'Today',
        'Yesterday',
        'Past week',
        'Past month',
        'Older'
      ]);
    });

    it('should return array with 5 periods', () => {
      const periods = getTimePeriods();
      expect(periods.length).toBe(5);
    });

    it('should return most recent period first', () => {
      const periods = getTimePeriods();
      expect(periods[0]).toBe('Today');
      expect(periods[periods.length - 1]).toBe('Older');
    });
  });
});
