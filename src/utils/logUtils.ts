/**
 * Centralized logging utilities
 * Provides consistent timestamp formatting and logging across the extension
 */

/**
 * Get formatted timestamp for logs
 * Format: HH:MM:SS.mmm
 *
 * @example
 * getTimestamp() // "14:32:17.042"
 */
export function getTimestamp(): string {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
}

/**
 * Log a message with timestamp and source tag
 *
 * @param source - Source identifier (e.g., "FileOps", "TreeProvider", "FileWatcher")
 * @param message - Log message
 * @param data - Optional additional data to log
 *
 * @example
 * log("FileOps", "Processing conversations", { count: 100 });
 * // Output: [14:32:17.042] [FileOps] Processing conversations { count: 100 }
 */
export function log(source: string, message: string, data?: any): void {
  if (data !== undefined) {
    console.log(`[${getTimestamp()}] [${source}] ${message}`, data);
  } else {
    console.log(`[${getTimestamp()}] [${source}] ${message}`);
  }
}

/**
 * Log an error with timestamp and source tag
 *
 * @param source - Source identifier (e.g., "FileOps", "TreeProvider")
 * @param message - Error message
 * @param error - Error object or additional data
 *
 * @example
 * logError("FileOps", "Failed to parse file", error);
 * // Output: [14:32:17.042] [FileOps] Failed to parse file Error: ...
 */
export function logError(source: string, message: string, error?: any): void {
  if (error !== undefined) {
    console.error(`[${getTimestamp()}] [${source}] ${message}`, error);
  } else {
    console.error(`[${getTimestamp()}] [${source}] ${message}`);
  }
}
