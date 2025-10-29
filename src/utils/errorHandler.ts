/**
 * Error handling utilities
 * Provides consistent error handling and logging across the extension
 */

import { logError } from './logUtils';

/**
 * Execute a function with error handling
 * Logs errors and returns a fallback value if the function throws
 *
 * @param fn - Function to execute
 * @param fallback - Value to return if function throws
 * @param source - Source identifier for logging
 * @param context - Additional context for error logging
 * @returns Result of fn() or fallback value
 *
 * @example
 * const result = safeExecute(
 *   () => JSON.parse(data),
 *   null,
 *   "FileOps",
 *   "Parsing conversation file"
 * );
 */
export function safeExecute<T>(
  fn: () => T,
  fallback: T,
  source: string,
  context?: string
): T {
  try {
    return fn();
  } catch (error) {
    if (context) {
      logError(source, context, error);
    } else {
      logError(source, 'Operation failed', error);
    }
    return fallback;
  }
}

/**
 * Execute an async function with error handling
 * Logs errors and returns a fallback value if the function throws
 *
 * @param fn - Async function to execute
 * @param fallback - Value to return if function throws
 * @param source - Source identifier for logging
 * @param context - Additional context for error logging
 * @returns Result of fn() or fallback value
 *
 * @example
 * const data = await safeExecuteAsync(
 *   async () => fs.promises.readFile(path, 'utf8'),
 *   '',
 *   "FileOps",
 *   "Reading conversation file"
 * );
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  source: string,
  context?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (context) {
      logError(source, context, error);
    } else {
      logError(source, 'Async operation failed', error);
    }
    return fallback;
  }
}

/**
 * Execute a function with silent error handling
 * Swallows errors without logging (use sparingly)
 *
 * @param fn - Function to execute
 * @param fallback - Value to return if function throws
 * @returns Result of fn() or fallback value
 *
 * @example
 * // Skip malformed lines silently
 * const parsed = silentExecute(() => JSON.parse(line), null);
 */
export function silentExecute<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
