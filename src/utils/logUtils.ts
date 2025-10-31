/**
 * Centralized logging utilities
 * Provides consistent timestamp formatting and logging across the extension
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let logFilePath: string | null = null;
let isDebugLoggingEnabled = false;

/**
 * Initialize debug logging
 * Called from extension.ts on activation
 */
export function initializeDebugLogging(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('claudeChats');
  isDebugLoggingEnabled = config.get('enableDebugLogs', false);

  if (isDebugLoggingEnabled && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    logFilePath = path.join(workspaceRoot, 'claude-chats-debug.log');

    // Write initial header
    writeToFile(`\n${'='.repeat(80)}\n`);
    writeToFile(`Claude Chats Debug Log - Session started at ${new Date().toISOString()}\n`);
    writeToFile(`${'='.repeat(80)}\n\n`);
  }

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeChats.enableDebugLogs')) {
        const newValue = vscode.workspace.getConfiguration('claudeChats').get('enableDebugLogs', false);
        if (newValue !== isDebugLoggingEnabled) {
          isDebugLoggingEnabled = newValue;
          if (isDebugLoggingEnabled) {
            // Initialize log file path if it wasn't set during activation
            if (!logFilePath && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
              const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
              logFilePath = path.join(workspaceRoot, 'claude-chats-debug.log');

              // Write initial header
              writeToFile(`\n${'='.repeat(80)}\n`);
              writeToFile(`Claude Chats Debug Log - Session started at ${new Date().toISOString()}\n`);
              writeToFile(`${'='.repeat(80)}\n\n`);
            }
            vscode.window.showInformationMessage('Claude Chats: Debug logging enabled. Logs will be written to claude-chats-debug.log in your workspace.');
          }
        }
      }
    })
  );
}

/**
 * Write to log file
 */
function writeToFile(message: string): void {
  if (!logFilePath || !isDebugLoggingEnabled) {
    return;
  }

  try {
    fs.appendFileSync(logFilePath, message, 'utf-8');
  } catch (error) {
    // Silently fail - don't want logging errors to break the extension
  }
}

/**
 * Get formatted timestamp for logs
 * Format: YYYY-MM-DD HH:MM:SS.mmm
 *
 * @example
 * getTimestamp() // "2025-10-31 14:32:17.042"
 */
export function getTimestamp(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
  return `${date} ${time}`;
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
 * // Console: [2025-10-31 14:32:17.042] [FileOps] Processing conversations { count: 100 }
 * // File: [2025-10-31 14:32:17.042] [FileOps] Processing conversations {"count":100}
 */
export function log(source: string, message: string, data?: any): void {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [${source}] ${message}`;

  // Always log to console
  if (data !== undefined) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }

  // Also write to file if enabled
  if (isDebugLoggingEnabled) {
    if (data !== undefined) {
      writeToFile(`${logMessage} ${JSON.stringify(data)}\n`);
    } else {
      writeToFile(`${logMessage}\n`);
    }
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
 * // Console: [2025-10-31 14:32:17.042] [FileOps] Failed to parse file Error: ...
 * // File: [2025-10-31 14:32:17.042] [ERROR] [FileOps] Failed to parse file Error: ...
 */
export function logError(source: string, message: string, error?: any): void {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [ERROR] [${source}] ${message}`;

  // Always log to console
  if (error !== undefined) {
    console.error(logMessage, error);
  } else {
    console.error(logMessage);
  }

  // Also write to file if enabled
  if (isDebugLoggingEnabled) {
    if (error !== undefined) {
      const errorStr = error instanceof Error ? `${error.message}\n${error.stack}` : JSON.stringify(error);
      writeToFile(`${logMessage} ${errorStr}\n`);
    } else {
      writeToFile(`${logMessage}\n`);
    }
  }
}
