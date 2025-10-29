/**
 * Date and time utility functions
 * Provides time period categorization for conversation grouping
 */

import { Conversation } from '../types';

/**
 * Time period categories for conversation grouping
 */
export type TimePeriod = 'Today' | 'Yesterday' | 'Past week' | 'Past month' | 'Older';

/**
 * Get the time period category for a given timestamp
 *
 * @param timestamp - Unix timestamp (ms since epoch)
 * @returns Time period category
 *
 * @example
 * const now = Date.now();
 * getTimePeriod(now)              // "Today"
 * getTimePeriod(now - 86400000)   // "Yesterday"
 * getTimePeriod(now - 604800000)  // "Past week"
 */
export function getTimePeriod(timestamp: number): TimePeriod {
  const now = Date.now();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
  const monthStart = todayStart - 30 * 24 * 60 * 60 * 1000;

  if (timestamp >= todayStart) {
    return 'Today';
  } else if (timestamp >= yesterdayStart) {
    return 'Yesterday';
  } else if (timestamp >= weekStart) {
    return 'Past week';
  } else if (timestamp >= monthStart) {
    return 'Past month';
  } else {
    return 'Older';
  }
}

/**
 * Group conversations by time period
 *
 * @param conversations - Array of conversations to group
 * @returns Map of time period to conversations
 *
 * @example
 * const conversations = await getAllConversations();
 * const groups = groupByTimePeriod(conversations);
 * groups.get('Today')     // [...conversations from today]
 * groups.get('Yesterday') // [...conversations from yesterday]
 */
export function groupByTimePeriod(conversations: Conversation[]): Map<TimePeriod, Conversation[]> {
  const groups = new Map<TimePeriod, Conversation[]>([
    ['Today', []],
    ['Yesterday', []],
    ['Past week', []],
    ['Past month', []],
    ['Older', []]
  ]);

  for (const conv of conversations) {
    const period = getTimePeriod(conv.lastMessageTime.getTime());
    groups.get(period)!.push(conv);
  }

  return groups;
}

/**
 * Get all time periods in display order
 *
 * @returns Array of time periods in order from most recent to oldest
 */
export function getTimePeriods(): TimePeriod[] {
  return ['Today', 'Yesterday', 'Past week', 'Past month', 'Older'];
}
