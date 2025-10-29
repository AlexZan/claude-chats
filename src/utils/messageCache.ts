/**
 * Message cache utilities
 * Caches parsed conversation messages to avoid re-parsing during search
 */

import { ConversationLine } from '../types';
import { normalizePath } from './pathUtils';

/**
 * Cache entry containing parsed messages and file modification time
 */
interface CacheEntry {
  messages: ConversationLine[];
  mtime: number; // File modification time in milliseconds
}

/**
 * Global message cache
 * Maps normalized file path -> cached messages + mtime
 */
class MessageCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly MAX_CACHE_SIZE = 500; // Limit cache size to prevent memory issues
  private readonly CACHE_TTL = 300000; // 5 minutes (300 seconds)
  private lastCleanup: number = Date.now();

  /**
   * Get cached messages for a file path
   * Returns null if not cached or cache is stale
   *
   * @param filePath - Path to conversation file
   * @param currentMtime - Current file modification time (milliseconds)
   * @returns Cached messages or null if cache miss/stale
   */
  get(filePath: string, currentMtime: number): ConversationLine[] | null {
    const key = normalizePath(filePath);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if cache is stale (file was modified)
    if (entry.mtime !== currentMtime) {
      return null;
    }

    return entry.messages;
  }

  /**
   * Store messages in cache
   *
   * @param filePath - Path to conversation file
   * @param messages - Parsed messages
   * @param mtime - File modification time (milliseconds)
   */
  set(filePath: string, messages: ConversationLine[], mtime: number): void {
    const key = normalizePath(filePath);

    // Periodic cleanup to prevent unbounded growth
    this.cleanupIfNeeded();

    this.cache.set(key, { messages, mtime });
  }

  /**
   * Invalidate cache entry for a specific file
   *
   * @param filePath - Path to conversation file
   */
  invalidate(filePath: string): void {
    const key = normalizePath(filePath);
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.lastCleanup = Date.now();
  }

  /**
   * Get cache size (for debugging)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Cleanup old entries if cache is too large or TTL expired
   * Runs at most once per minute
   */
  private cleanupIfNeeded(): void {
    const now = Date.now();
    const timeSinceCleanup = now - this.lastCleanup;

    // Only cleanup if it's been at least 1 minute since last cleanup
    if (timeSinceCleanup < 60000) {
      return;
    }

    // If cache is over size limit, remove oldest 20% of entries
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const entriesToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.2);
      const keys = Array.from(this.cache.keys());

      for (let i = 0; i < entriesToRemove && i < keys.length; i++) {
        this.cache.delete(keys[i]);
      }
    }

    this.lastCleanup = now;
  }
}

/**
 * Singleton message cache instance
 */
export const messageCache = new MessageCache();
