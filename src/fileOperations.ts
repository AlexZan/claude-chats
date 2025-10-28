import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, Conversation, ConversationLine, SummaryMessage } from './types';

/**
 * Helper class for safe file operations on conversation files
 */
export class FileOperations {
  private static readonly CLAUDE_DIR = path.join(os.homedir(), '.claude');
  private static readonly PROJECTS_DIR = path.join(FileOperations.CLAUDE_DIR, 'projects');
  private static readonly ARCHIVE_DIR = path.join(FileOperations.PROJECTS_DIR, '_archive');

  /**
   * Get formatted timestamp for logs
   */
  private static getTimestamp(): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
  }

  /**
   * Parse a .jsonl conversation file
   */
  static parseConversation(filePath: string): ConversationLine[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line) as ConversationLine;
      } catch (error) {
        throw new Error(`Failed to parse line in ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Async version of parseConversation - uses async file I/O
   * Recommended for use in async contexts to avoid blocking the UI thread
   */
  static async parseConversationAsync(filePath: string): Promise<ConversationLine[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line) as ConversationLine;
      } catch (error) {
        throw new Error(`Failed to parse line in ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Type guard to check if a line is a ConversationMessage
   */
  private static isConversationMessage(line: ConversationLine): line is ConversationMessage {
    return line.type === 'user' || line.type === 'assistant';
  }

  /**
   * Type guard to check if a line is a SummaryMessage
   */
  private static isSummaryMessage(line: ConversationLine): line is SummaryMessage {
    return line.type === 'summary';
  }

  /**
   * Extract conversation metadata in a single pass
   * Avoids duplicate parsing of the same file
   * Returns title, hasRealMessages, and lastMessageTime all from one parse
   */
  static extractConversationMetadata(messages: ConversationLine[], filePath: string): {
    title: string;
    hasRealMessages: boolean;
    lastMessageTime: Date;
  } {
    let title = 'Untitled';
    let hasRealMessages = false;
    let lastMessageTime = new Date();

    // Get all message UUIDs in THIS file (for summary validation)
    const messageUuids = new Set<string>();
    for (const message of messages) {
      if ('uuid' in message && message.uuid) {
        messageUuids.add(message.uuid);
      }
    }

    // Single pass through messages to extract timestamp and detect real messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];

      // Track if we have real messages (for filtering empty conversations)
      if (!hasRealMessages && FileOperations.isConversationMessage(message) && !message.isSidechain) {
        hasRealMessages = true;
      }

      // Get last message timestamp (from last non-sidechain message)
      if (lastMessageTime.getTime() === new Date().getTime() && 'timestamp' in message && message.timestamp) {
        if (FileOperations.isConversationMessage(message) && !message.isSidechain) {
          lastMessageTime = new Date(message.timestamp);
        }
      }
    }

    // Extract title (Priority 1: Local summary)
    for (const message of messages) {
      if (FileOperations.isSummaryMessage(message)) {
        const summary = message.summary;
        const leafUuid = message.leafUuid;

        // Skip warmup/initialization summaries
        if (/warmup|readiness|initialization|ready|assistant ready|codebase|exploration|introduction|search|repository/i.test(summary)) {
          continue;
        }

        // Only use summaries whose leafUuid points to a message in THIS file
        if (leafUuid && !messageUuids.has(leafUuid)) {
          continue;
        }

        // Found a valid local summary
        title = summary;
        break;
      }
    }

    // Priority 2: Check for cross-file summary (if still untitled)
    if (title === 'Untitled') {
      try {
        const crossFileSummary = FileOperations.findCrossFileSummary(filePath);
        if (crossFileSummary) {
          title = crossFileSummary;
        }
      } catch (error) {
        // Silent - continue to next priority
      }
    }

    // Priority 3: Fallback to first user message
    if (title === 'Untitled') {
      const firstMessage = FileOperations.getFirstUserMessage(messages);
      if (firstMessage) {
        const text = FileOperations.extractText(firstMessage);
        if (text) {
          title = text.split('\n')[0].substring(0, 100);
        }
      }
    }

    return { title, hasRealMessages, lastMessageTime };
  }

  /**
   * Get the first meaningful user message from already-parsed messages
   * Avoids re-parsing the file by accepting messages as a parameter
   * Looks for messages in order:
   * 1. First non-sidechain user message (actual user input)
   * 2. First non-sidechain message (any type) that's not metadata
   * 3. For warmup-only: first sidechain assistant message (initialization)
   * 4. Last resort: first sidechain message (the "Warmup" message itself)
   */
  static getFirstUserMessage(messages: ConversationLine[]): ConversationMessage | null {
    // First pass: look for non-sidechain user messages (actual conversation titles)
    for (const line of messages) {
      if ('_metadata' in line) {
        continue;
      }
      if (!FileOperations.isConversationMessage(line)) {
        continue;
      }
      if (line.isSidechain) {
        continue;
      }
      if (line.type !== 'user') {
        continue;
      }

      const text = FileOperations.extractText(line);
      if (!text) {
        continue;
      }

      // Skip warmup/initialization messages - look for actual conversation content
      if (/^warmup$/i.test(text.trim())) {
        continue;
      }

      return line; // Found the first real user message
    }

    // Second pass: look for non-sidechain messages of any type
    for (const line of messages) {
      if ('_metadata' in line) {
        continue;
      }
      if (!FileOperations.isConversationMessage(line)) {
        continue;
      }
      if (line.isSidechain) {
        continue;
      }

      const text = FileOperations.extractText(line);
      if (!text) {
        continue;
      }

      return line; // Found the first real message (likely assistant)
    }

    // Third pass: for warmup-only conversations, use assistant initialization message
    for (const line of messages) {
      if ('_metadata' in line) {
        continue;
      }
      if (!FileOperations.isConversationMessage(line)) {
        continue;
      }
      if (!line.isSidechain) {
        continue;
      }
      if (line.type !== 'assistant') {
        continue;
      }

      const text = FileOperations.extractText(line);
      if (!text || text === 'Warmup') {
        continue;
      }

      return line; // Found assistant's warmup response
    }

    // Last resort: return any message with content
    for (const line of messages) {
      if ('_metadata' in line) {
        continue;
      }
      if (!FileOperations.isConversationMessage(line)) {
        continue;
      }

      const text = FileOperations.extractText(line);
      if (!text || text === 'Warmup') {
        continue;
      }

      return line;
    }

    return null;
  }

  /**
   * Helper: extract user-visible text from a message, skipping system metadata
   * For multi-part messages, returns the first non-system text found
   */
  private static extractText(message: ConversationMessage): string {
    if (!message.message || !message.message.content) {
      return '';
    }

    const { content } = message.message;

    if (typeof content === 'string') {
      const text = content.trim();
      // Return empty if it's a system message
      if (/^<(ide_|system-|user-|command-)/.test(text)) {
        return '';
      }
      return text;
    }

    if (Array.isArray(content)) {
      // For multi-part messages, find the first non-system text
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          const text = item.text.trim();
          // Skip system metadata - look for actual user text
          if (!/^<(ide_|system-|user-|command-)/.test(text)) {
            return text;
          }
        }
      }

      // If all parts are system messages, return empty
      return '';
    }

    return '';
  }

  /**
   * Check if conversation has any real (non-sidechain) user messages
   * Filters out warmup-only conversations that the user never actually started
   */
  static hasRealMessages(filePath: string): boolean {
    try {
      const messages = FileOperations.parseConversation(filePath);

      // Look for any NON-SIDECHAIN user message that isn't just "warmup"
      for (const line of messages) {
        // Skip metadata
        if ('_metadata' in line) {
          continue;
        }

        // Skip summary messages
        if (!FileOperations.isConversationMessage(line)) {
          continue;
        }

        // Skip sidechain messages (warmup/initialization)
        if (line.isSidechain) {
          continue;
        }

        // Only look for user messages
        if (line.type !== 'user') {
          continue;
        }

        // Get content
        const content = line.message?.content;
        if (!content) {
          continue;
        }

        // Check if there's any real user content (not just system metadata)
        let hasRealContent = false;

        if (typeof content === 'string') {
          // String content - check if it's not a system metadata message
          if (!/^<(ide_|system-|user-|command-)/.test(content.trim())) {
            hasRealContent = true;
          }
        } else if (Array.isArray(content)) {
          // Array content - check each text item individually
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              const text = item.text.trim();
              // Skip system metadata items
              if (/^<(ide_|system-|user-|command-)/.test(text)) {
                continue;
              }
              // Found a real text item that's not system metadata
              if (text.length > 0) {
                hasRealContent = true;
                break;
              }
            }
          }
        }

        if (hasRealContent) {
          // Found a real (non-sidechain) message with actual user content
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Async version of hasRealMessages - uses async file I/O
   * Recommended for use in async contexts to avoid blocking the UI thread
   */
  static async hasRealMessagesAsync(filePath: string): Promise<boolean> {
    try {
      const messages = await FileOperations.parseConversationAsync(filePath);

      // Look for any NON-SIDECHAIN user message that isn't just "warmup"
      for (const line of messages) {
        // Skip metadata
        if ('_metadata' in line) {
          continue;
        }

        // Skip summary messages
        if (!FileOperations.isConversationMessage(line)) {
          continue;
        }

        // Skip sidechain messages (warmup/initialization)
        if (line.isSidechain) {
          continue;
        }

        // Only look for user messages
        if (line.type !== 'user') {
          continue;
        }

        // Get content
        const content = line.message?.content;
        if (!content) {
          continue;
        }

        // Check if there's any real user content (not just system metadata)
        let hasRealContent = false;

        if (typeof content === 'string') {
          // String content - check if it's not a system metadata message
          if (!/^<(ide_|system-|user-|command-)/.test(content.trim())) {
            hasRealContent = true;
          }
        } else if (Array.isArray(content)) {
          // Array content - check each text item individually
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              const text = item.text.trim();
              // Skip system metadata items
              if (/^<(ide_|system-|user-|command-)/.test(text)) {
                continue;
              }
              // Found a real text item that's not system metadata
              if (text.length > 0) {
                hasRealContent = true;
                break;
              }
            }
          }
        }

        if (hasRealContent) {
          // Found a real (non-sidechain) message with actual user content
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if this conversation would be hidden by Claude Code
   * A conversation is hidden if it contains a summary with leafUuid pointing to another file
   */
  static isHiddenInClaudeCode(filePath: string): boolean {
    try {
      const messages = FileOperations.parseConversation(filePath);
      const projectDir = path.dirname(filePath);

      // Look for summary messages with leafUuid in this file
      for (const message of messages) {
        if (FileOperations.isSummaryMessage(message)) {
          const leafUuid = message.leafUuid;
          if (!leafUuid) {
            continue;
          }

          // Check if this leafUuid points to a message in THIS file
          const hasLocalMessage = messages.some(m => 'uuid' in m && m.uuid === leafUuid);

          if (hasLocalMessage) {
            // leafUuid points to a message in this file, so it's shown
            continue;
          }

          // leafUuid points to a different file - this conversation is hidden by Claude Code
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Async version of isHiddenInClaudeCode - uses async file I/O
   * A conversation is hidden if it contains a summary with leafUuid pointing to another file
   */
  static async isHiddenInClaudeCodeAsync(filePath: string): Promise<boolean> {
    try {
      const messages = await FileOperations.parseConversationAsync(filePath);
      const projectDir = path.dirname(filePath);

      // Look for summary messages with leafUuid in this file
      for (const message of messages) {
        if (FileOperations.isSummaryMessage(message)) {
          const leafUuid = message.leafUuid;
          if (!leafUuid) {
            continue;
          }

          // Check if this leafUuid points to a message in THIS file
          const hasLocalMessage = messages.some(m => 'uuid' in m && m.uuid === leafUuid);

          if (hasLocalMessage) {
            // leafUuid points to a message in this file, so it's shown
            continue;
          }

          // leafUuid points to a different file - this conversation is hidden by Claude Code
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find cross-file summary that references this conversation via leafUuid
   * Returns both the summary text and the leafUuid
   */
  private static findCrossFileSummaryWithUuid(filePath: string): { summary: string; leafUuid: string } | null {
    try {
      // Get all message UUIDs from this file
      const messages = FileOperations.parseConversation(filePath);
      const messageUuids = new Set<string>();
      for (const message of messages) {
        if ('uuid' in message && message.uuid) {
          messageUuids.add(message.uuid);
        }
      }

      if (messageUuids.size === 0) {
        return null;
      }

      // Get project directory (parent of this file)
      const projectDir = path.dirname(filePath);

      // Search all other .jsonl files in the same project directory
      const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        // Skip the current file
        if (file === path.basename(filePath)) {
          continue;
        }

        const otherFilePath = path.join(projectDir, file);

        try {
          const otherMessages = FileOperations.parseConversation(otherFilePath);

          // Look for summary messages with leafUuid pointing to our messages
          for (const message of otherMessages) {
            if (FileOperations.isSummaryMessage(message)) {
              const leafUuid = message.leafUuid;
              if (leafUuid && messageUuids.has(leafUuid)) {
                const summary = message.summary;
                // Skip warmup/initialization summaries
                if (!/warmup|readiness|initialization|ready|assistant ready|codebase|exploration|introduction|search|repository/i.test(summary)) {
                  return { summary, leafUuid };
                }
              }
            }
          }
        } catch (error) {
          // Skip files that can't be parsed
          continue;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find cross-file summary that references this conversation via leafUuid
   * Claude Code uses leafUuid to link summary messages across session files
   */
  private static findCrossFileSummary(filePath: string): string | null {
    const result = FileOperations.findCrossFileSummaryWithUuid(filePath);
    return result ? result.summary : null;
  }

  /**
   * Get conversation title from already-parsed messages or file
   * Priority:
   * 1. Local summary (in this file) - takes precedence for renamed conversations
   * 2. Cross-file summary (leafUuid pointing to this file's messages)
   * 3. First user message
   * This matches Claude Code's title display behavior
   */
  static getConversationTitle(filePathOrMessages: string | ConversationLine[], filePath?: string): string {
    // Support both old (filePath: string) and new (messages: ConversationLine[]) signatures
    let messages: ConversationLine[];
    let actualFilePath: string;

    if (typeof filePathOrMessages === 'string') {
      // Old signature: filePath only
      actualFilePath = filePathOrMessages;
      messages = FileOperations.parseConversation(actualFilePath);
    } else {
      // New signature: messages provided, filePath optional
      messages = filePathOrMessages;
      actualFilePath = filePath || '';
    }

    // Priority 1: Check for LOCAL summary field first (takes precedence over cross-file)
    try {

      // Get all message UUIDs in THIS file
      const messageUuids = new Set<string>();
      for (const message of messages) {
        if ('uuid' in message && message.uuid) {
          messageUuids.add(message.uuid);
        }
      }

      // Check for summary field - use FIRST non-warmup summary whose leafUuid points to THIS file
      for (const message of messages) {
        if (FileOperations.isSummaryMessage(message)) {
          const summary = message.summary;
          const leafUuid = message.leafUuid;

          // Skip warmup/initialization summaries - Claude Code filters these
          if (/warmup|readiness|initialization|ready|assistant ready|codebase|exploration|introduction|search|repository/i.test(summary)) {
            continue;
          }

          // Only use summaries whose leafUuid points to a message in THIS file
          // Summaries pointing to other files are for those other conversations
          if (leafUuid && !messageUuids.has(leafUuid)) {
            continue;
          }

          // Found a valid local summary
          return summary;
        }
      }
    } catch (error) {
      // Silent - fall through to next priority
    }

    // Priority 2: Check for cross-file summary (leafUuid mechanism)
    try {
      const crossFileSummary = FileOperations.findCrossFileSummary(actualFilePath);
      if (crossFileSummary) {
        return crossFileSummary;
      }
    } catch (error) {
      // Silent - fall through to next priority
    }

    // Priority 3: Fallback to first user message
    const firstMessage = FileOperations.getFirstUserMessage(messages);

    if (!firstMessage) {
      return 'Untitled';
    }

    const text = FileOperations.extractText(firstMessage);

    if (!text) {
      return 'Untitled';
    }

    return text.split('\n')[0].substring(0, 100);
  }

  /**
   * Update conversation title by inserting a new title message (preserves original)
   */
  static updateFirstUserMessage(filePath: string, newContent: string): void {
    // Create backup first
    if (this.shouldCreateBackup()) {
      fs.copyFileSync(filePath, `${filePath}.backup`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Find first non-sidechain user messages
    let firstMessageIdx: number | null = null;
    let firstMessageData: ConversationMessage | null = null;
    let secondMessageIdx: number | null = null;
    let userMessageCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      try {
        const message = JSON.parse(line) as ConversationMessage;

        // Skip metadata
        if ('_metadata' in message) {
          continue;
        }

        // Look for non-sidechain user messages
        if (message.type === 'user' && message.isSidechain === false) {
          userMessageCount++;

          if (userMessageCount === 1) {
            firstMessageIdx = i;
            firstMessageData = message;
          } else if (userMessageCount === 2) {
            secondMessageIdx = i;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (firstMessageIdx === null || !firstMessageData) {
      throw new Error('Could not find first user message');
    }

    // Check if title already exists (two user messages in a row, first is short)
    let titleExists = false;
    if (secondMessageIdx === firstMessageIdx + 1) {
      const firstContent = firstMessageData.message.content;

      // Check if it's a short string
      if (typeof firstContent === 'string' && firstContent.length < 100) {
        titleExists = true;
      }

      // Check if it's a short array with text (our title format)
      if (Array.isArray(firstContent) && firstContent.length === 1) {
        const item = firstContent[0];
        if (item.type === 'text' && item.text && item.text.length < 100) {
          titleExists = true;
        }
      }
    }

    // Get timestamp 1ms earlier than original
    const originalTimestamp = firstMessageData.timestamp;
    let newTimestamp = originalTimestamp;
    try {
      const dt = new Date(originalTimestamp);
      dt.setMilliseconds(dt.getMilliseconds() - 1);
      newTimestamp = dt.toISOString();
    } catch (error) {
      // Use original if parsing fails
    }

    // Create new title message
    const newTitleMessage: ConversationMessage = {
      parentUuid: null,
      isSidechain: false,
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: newContent }]
      },
      uuid: this.generateUuid(),
      timestamp: newTimestamp,
      sessionId: firstMessageData.sessionId,
      cwd: firstMessageData.cwd,
      version: firstMessageData.version,
      gitBranch: firstMessageData.gitBranch,
      userType: firstMessageData.userType
    };

    const newTitleLine = JSON.stringify(newTitleMessage);

    if (titleExists) {
      // Replace existing title
      lines[firstMessageIdx] = newTitleLine;
    } else {
      // Insert new title before first message
      lines.splice(firstMessageIdx, 0, newTitleLine);
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  /**
   * Generate a UUID v4
   */
  private static generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Find the last non-sidechain message UUID in a conversation file
   * This is needed for the leafUuid in summary messages
   */
  private static findLastNonSidechainMessageUuid(filePath: string): string | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Scan backwards from the end to find last non-sidechain message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const message = JSON.parse(lines[i]) as ConversationLine;

        // Skip metadata
        if ('_metadata' in message) {
          continue;
        }

        // Check if it's a conversation message (user or assistant)
        if (this.isConversationMessage(message) && !message.isSidechain && message.uuid) {
          return message.uuid;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  /**
   * Find existing summary messages in a conversation file
   * Returns array of {lineIndex, summary} objects
   */
  private static findSummaryMessages(filePath: string): Array<{lineIndex: number, summary: SummaryMessage}> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const summaries: Array<{lineIndex: number, summary: SummaryMessage}> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      try {
        const message = JSON.parse(line) as ConversationLine;
        if (this.isSummaryMessage(message)) {
          summaries.push({lineIndex: i, summary: message});
        }
      } catch (error) {
        continue;
      }
    }

    return summaries;
  }

  /**
   * Update cross-file summaries that reference the given conversation
   * When a conversation is renamed, we need to update summaries in OTHER files
   * that point to this conversation via leafUuid
   */
  private static updateCrossFileSummaries(filePath: string, newTitle: string): void {
    // Get all message UUIDs from the target file
    const targetMessages = this.parseConversation(filePath);
    const targetMessageUuids = new Set<string>();
    for (const message of targetMessages) {
      if ('uuid' in message && message.uuid) {
        targetMessageUuids.add(message.uuid);
      }
    }

    if (targetMessageUuids.size === 0) {
      return;
    }

    // Get project directory
    const projectDir = path.dirname(filePath);
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      // Skip the current file (we already updated it)
      if (file === path.basename(filePath)) {
        continue;
      }

      const otherFilePath = path.join(projectDir, file);

      try {
        // Find summaries in this file
        const summaries = this.findSummaryMessages(otherFilePath);

        if (summaries.length === 0) {
          continue;
        }

        // Check if any summaries point to our target conversation
        const summariesToUpdate: Array<{lineIndex: number, summary: SummaryMessage}> = [];
        for (const {lineIndex, summary} of summaries) {
          if (summary.leafUuid && targetMessageUuids.has(summary.leafUuid)) {
            summariesToUpdate.push({lineIndex, summary});
          }
        }

        if (summariesToUpdate.length === 0) {
          continue;
        }

        // Update the summaries in this file
        const content = fs.readFileSync(otherFilePath, 'utf-8');
        const lines = content.split('\n');

        for (const {lineIndex, summary} of summariesToUpdate) {
          const updatedSummary: SummaryMessage = {
            type: 'summary',
            summary: newTitle,
            leafUuid: summary.leafUuid
          };
          lines[lineIndex] = JSON.stringify(updatedSummary);
        }

        // Write back to the other file
        fs.writeFileSync(otherFilePath, lines.join('\n'), 'utf-8');

      } catch (error) {
        // Silent - skip files that can't be processed
        continue;
      }
    }
  }

  /**
   * Update conversation title using summary-based approach (RECOMMENDED)
   * This method adds or modifies a summary message to change the conversation title
   * without touching the actual conversation content
   */
  static updateConversationTitle(filePath: string, newTitle: string): void {
    // Create backup first
    if (this.shouldCreateBackup()) {
      fs.copyFileSync(filePath, `${filePath}.backup`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Check if summary already exists first
    const existingSummaries = this.findSummaryMessages(filePath);

    // Find last non-sidechain message UUID for leafUuid (if any in THIS file)
    let leafUuid = this.findLastNonSidechainMessageUuid(filePath);

    // If no local non-sidechain messages, preserve existing cross-file leafUuid
    if (!leafUuid && existingSummaries.length > 0) {
      leafUuid = existingSummaries[0].summary.leafUuid;
    }

    if (!leafUuid) {
      throw new Error('Could not find any non-sidechain messages in conversation and no existing summary to preserve');
    }

    if (existingSummaries.length > 0) {
      // Modify the first summary
      let targetSummary = existingSummaries[0];

      // Update the summary (preserve leafUuid - either local or cross-file)
      const updatedSummary: SummaryMessage = {
        type: 'summary',
        summary: newTitle,
        leafUuid: leafUuid
      };

      lines[targetSummary.lineIndex] = JSON.stringify(updatedSummary);
    } else {
      // Add new summary at the beginning (line 0)
      const newSummary: SummaryMessage = {
        type: 'summary',
        summary: newTitle,
        leafUuid: leafUuid
      };

      // Insert at beginning
      lines.unshift(JSON.stringify(newSummary));
    }

    // Write back to file
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

    // Now update any cross-file summaries that point to this conversation
    this.updateCrossFileSummaries(filePath, newTitle);
  }

  /**
   * Get current project name from workspace path
   */
  static getCurrentProjectName(): string | null {
    const workspaceFolders = require('vscode').workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Convert path to Claude's project directory format
    // e.g., "D:\Dev\MyProject" -> "d--Dev-MyProject"
    // e.g., "c:\Users\Lex\bot-testa" -> "c--Users-Lex-bot-testa"
    // First handle drive letter (C: -> c--), then replace remaining slashes
    let normalized = workspacePath
      .replace(/^([a-zA-Z]):\\/, (_match: string, drive: string) => drive.toLowerCase() + '--')
      .replace(/^([a-zA-Z]):\//, (_match: string, drive: string) => drive.toLowerCase() + '--')
      .replace(/\\/g, '-')
      .replace(/\//g, '-');

    return normalized;
  }

  /**
   * Get all conversations from projects directory (optionally filtered to current project)
   */
  static getAllConversations(filterToCurrentProject: boolean = true, showEmpty: boolean = false): Conversation[] {
    if (!fs.existsSync(FileOperations.PROJECTS_DIR)) {
      return [];
    }

    const conversations: Conversation[] = [];
    const currentProject = filterToCurrentProject ? FileOperations.getCurrentProjectName() : null;
    const projectDirs = fs.readdirSync(FileOperations.PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      // Skip archive directory
      if (projectDir === '_archive') {
        continue;
      }

      // Filter to current project if requested (case-insensitive comparison)
      if (filterToCurrentProject && currentProject && projectDir.toLowerCase() !== currentProject.toLowerCase()) {
        continue;
      }

      const projectPath = path.join(FileOperations.PROJECTS_DIR, projectDir);

      if (!fs.statSync(projectPath).isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(projectPath);

      for (const file of files) {
        if (!file.endsWith('.jsonl') || file.endsWith('.backup')) {
          continue;
        }

        const filePath = path.join(projectPath, file);
        const stats = fs.statSync(filePath);

        try {
          // Parse once and extract all needed metadata
          const messages = FileOperations.parseConversation(filePath);
          const metadata = FileOperations.extractConversationMetadata(messages, filePath);

          // Skip empty conversations if setting is disabled
          if (!showEmpty && !metadata.hasRealMessages) {
            continue;
          }

          // Get conversation timestamp (matches Claude Code behavior)
          // Priority 1: If cross-file summary exists, use the leafUuid message timestamp
          // Priority 2: Use last message timestamp (most recent activity)
          // Priority 3: Fall back to file mtime
          let lastMessageTime = metadata.lastMessageTime;
          let actualLastMessageTime = metadata.lastMessageTime;

          const crossFileSummary = FileOperations.findCrossFileSummaryWithUuid(filePath);
          if (crossFileSummary) {
            // Find the message with this UUID to get its timestamp
            const leafMessage = messages.find(m => 'uuid' in m && m.uuid === crossFileSummary.leafUuid);
            if (leafMessage && 'timestamp' in leafMessage && leafMessage.timestamp) {
              lastMessageTime = new Date(leafMessage.timestamp);
              actualLastMessageTime = lastMessageTime;
            }
          }

          conversations.push({
            id: path.parse(file).name,
            title: metadata.title,
            filePath,
            project: projectDir,
            lastModified: stats.mtime,
            lastMessageTime: lastMessageTime,
            actualLastMessageTime: actualLastMessageTime,
            messageCount: messages.length,
            fileSize: stats.size,
            isArchived: false,
            hasRealMessages: metadata.hasRealMessages
          });
        } catch (error) {
          console.error(`Failed to parse conversation ${filePath}:`, error);
        }
      }
    }

    return conversations;
  }

  /**
   * Async version of getAllConversations - uses async file I/O
   * Recommended for use in async contexts to avoid blocking the UI thread
   */
  static async getAllConversationsAsync(filterToCurrentProject: boolean = true, showEmpty: boolean = false): Promise<Conversation[]> {
    try {
      if (!fs.existsSync(FileOperations.PROJECTS_DIR)) {
        return [];
      }

      const conversations: Conversation[] = [];
      const currentProject = filterToCurrentProject ? FileOperations.getCurrentProjectName() : null;

      let projectDirs: string[];
      try {
        projectDirs = await fs.promises.readdir(FileOperations.PROJECTS_DIR);
      } catch (error) {
        console.error('[FileOps] Error reading projects directory:', error);
        return [];
      }
      for (const projectDir of projectDirs) {
        // Skip archive directory
        if (projectDir === '_archive') {
          continue;
        }

        // Filter to current project if requested (case-insensitive comparison)
        if (filterToCurrentProject && currentProject && projectDir.toLowerCase() !== currentProject.toLowerCase()) {
          continue;
        }

        const projectPath = path.join(FileOperations.PROJECTS_DIR, projectDir);

        try {
          const stat = await fs.promises.stat(projectPath);
          if (!stat.isDirectory()) {
            continue;
          }
        } catch {
          continue; // Skip if can't stat directory
        }

        const files = await fs.promises.readdir(projectPath);
        const jsonlFiles = files.filter(file => file.endsWith('.jsonl') && !file.endsWith('.backup'));

        if (jsonlFiles.length > 0) {
          console.log(`[${FileOperations.getTimestamp()}] [FileOps] Processing ${jsonlFiles.length} conversation files in parallel...`);
        }

        // Process all files in parallel using Promise.all
        const filePromises = jsonlFiles
          .map(async (file) => {
            const filePath = path.join(projectPath, file);

            try {
              const stats = await fs.promises.stat(filePath);

              // Parse once and extract all needed metadata
              let messages: ConversationLine[];
              try {
                messages = await FileOperations.parseConversationAsync(filePath);
              } catch (parseError) {
                console.error(`[FileOps] Failed to parse conversation ${filePath}:`, parseError);
                return null;
              }

              let metadata: any;
              try {
                metadata = FileOperations.extractConversationMetadata(messages, filePath);
              } catch (metaError) {
                console.error(`[FileOps] Failed to extract metadata from ${filePath}:`, metaError);
                return null;
              }

              // Skip empty conversations if setting is disabled
              if (!showEmpty && !metadata.hasRealMessages) {
                return null;
              }

              // Get conversation timestamp (matches Claude Code behavior)
              // Priority 1: If cross-file summary exists, use the leafUuid message timestamp
              // Priority 2: Use last message timestamp (most recent activity)
              // Priority 3: Fall back to file mtime
              let lastMessageTime = metadata.lastMessageTime;
              let actualLastMessageTime = metadata.lastMessageTime;

              // Skip cross-file summary search during initial load to avoid O(n²) file parsing
              // This will be populated lazily when needed by the tree item renderer
              // let crossFileSummary: any;
              // try {
              //   crossFileSummary = FileOperations.findCrossFileSummaryWithUuid(filePath);
              // } catch (cfError) {
              //   console.error(`[FileOps] Failed to find cross-file summary for ${filePath}:`, cfError);
              //   crossFileSummary = null;
              // }

              // if (crossFileSummary) {
              //   // Find the message with this UUID to get its timestamp
              //   const leafMessage = messages.find(m => 'uuid' in m && m.uuid === crossFileSummary.leafUuid);
              //   if (leafMessage && 'timestamp' in leafMessage && leafMessage.timestamp) {
              //     lastMessageTime = new Date(leafMessage.timestamp);
              //     actualLastMessageTime = lastMessageTime;
              //   }
              // }

              return {
                id: path.parse(file).name,
                title: metadata.title,
                filePath,
                project: projectDir,
                lastModified: stats.mtime,
                lastMessageTime: lastMessageTime,
                actualLastMessageTime: actualLastMessageTime,
                messageCount: messages.length,
                fileSize: stats.size,
                isArchived: false,
                hasRealMessages: metadata.hasRealMessages
              };
            } catch (error) {
              console.error(`[FileOps] Unexpected error parsing conversation ${filePath}:`, error);
              return null;
            }
          });

        // Wait for all files to be processed in parallel
        const results = await Promise.all(filePromises);
        const validConversations = results.filter((conv): conv is Conversation => conv !== null);
        conversations.push(...validConversations);
      }

      console.log(`[${FileOperations.getTimestamp()}] [FileOps] getAllConversationsAsync finished with ${conversations.length} conversations`);
      return conversations;
    } catch (error) {
      console.error('[FileOps] Error in getAllConversationsAsync:', error);
      return [];
    }
  }

  /**
   * Get all archived conversations (optionally filtered to current project)
   */
  static getArchivedConversations(filterToCurrentProject: boolean = true, showEmpty: boolean = false): Conversation[] {
    if (!fs.existsSync(FileOperations.ARCHIVE_DIR)) {
      return [];
    }

    const conversations: Conversation[] = [];
    const currentProject = filterToCurrentProject ? FileOperations.getCurrentProjectName() : null;
    const projectDirs = fs.readdirSync(FileOperations.ARCHIVE_DIR);

    for (const projectDir of projectDirs) {
      // Filter to current project if requested (case-insensitive comparison)
      if (filterToCurrentProject && currentProject && projectDir.toLowerCase() !== currentProject.toLowerCase()) {
        continue;
      }

      const projectPath = path.join(FileOperations.ARCHIVE_DIR, projectDir);

      if (!fs.statSync(projectPath).isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(projectPath);

      for (const file of files) {
        if (!file.endsWith('.jsonl') || file.endsWith('.backup')) {
          continue;
        }

        const filePath = path.join(projectPath, file);
        const stats = fs.statSync(filePath);

        try {
          // Parse once and extract all needed metadata
          const messages = FileOperations.parseConversation(filePath);
          const metadata = FileOperations.extractConversationMetadata(messages, filePath);

          // Skip empty conversations if setting is disabled
          if (!showEmpty && !metadata.hasRealMessages) {
            continue;
          }

          // Get conversation timestamp (matches Claude Code behavior)
          // Priority 1: If cross-file summary exists, use the leafUuid message timestamp
          // Priority 2: Use last message timestamp (most recent activity)
          // Priority 3: Fall back to file mtime
          let lastMessageTime = metadata.lastMessageTime;
          let actualLastMessageTime = metadata.lastMessageTime;

          const crossFileSummary = FileOperations.findCrossFileSummaryWithUuid(filePath);
          if (crossFileSummary) {
            // Find the message with this UUID to get its timestamp
            const leafMessage = messages.find(m => 'uuid' in m && m.uuid === crossFileSummary.leafUuid);
            if (leafMessage && 'timestamp' in leafMessage && leafMessage.timestamp) {
              lastMessageTime = new Date(leafMessage.timestamp);
              actualLastMessageTime = lastMessageTime;
            }
          }

          conversations.push({
            id: path.parse(file).name,
            title: metadata.title,
            filePath,
            project: projectDir,
            lastModified: stats.mtime,
            lastMessageTime: lastMessageTime,
            actualLastMessageTime: actualLastMessageTime,
            messageCount: messages.length,
            fileSize: stats.size,
            isArchived: true,
            hasRealMessages: metadata.hasRealMessages
          });
        } catch (error) {
          console.error(`Failed to parse archived conversation ${filePath}:`, error);
        }
      }
    }

    return conversations;
  }

  /**
   * Async version of getArchivedConversations - uses async file I/O
   * Recommended for use in async contexts to avoid blocking the UI thread
   */
  static async getArchivedConversationsAsync(filterToCurrentProject: boolean = true, showEmpty: boolean = false): Promise<Conversation[]> {
    try {
      if (!fs.existsSync(FileOperations.ARCHIVE_DIR)) {
        return [];
      }

      const conversations: Conversation[] = [];
      const currentProject = filterToCurrentProject ? FileOperations.getCurrentProjectName() : null;

      let projectDirs: string[];
      try {
        projectDirs = await fs.promises.readdir(FileOperations.ARCHIVE_DIR);
      } catch (error) {
        console.error('Error reading archive directory:', error);
        return [];
      }

      for (const projectDir of projectDirs) {
        // Filter to current project if requested (case-insensitive comparison)
        if (filterToCurrentProject && currentProject && projectDir.toLowerCase() !== currentProject.toLowerCase()) {
          continue;
        }

        const projectPath = path.join(FileOperations.ARCHIVE_DIR, projectDir);

        try {
          const stat = await fs.promises.stat(projectPath);
          if (!stat.isDirectory()) {
            continue;
          }
        } catch {
          continue; // Skip if can't stat directory
        }

        const files = await fs.promises.readdir(projectPath);

        // Process all files in parallel using Promise.all
        const filePromises = files
          .filter(file => file.endsWith('.jsonl') && !file.endsWith('.backup'))
          .map(async (file) => {
            const filePath = path.join(projectPath, file);

            try {
              const stats = await fs.promises.stat(filePath);

              // Parse once and extract all needed metadata
              let messages: ConversationLine[];
              try {
                messages = await FileOperations.parseConversationAsync(filePath);
              } catch (parseError) {
                console.error(`[FileOps] Failed to parse archived conversation async ${filePath}:`, parseError);
                return null;
              }

              let metadata: any;
              try {
                metadata = FileOperations.extractConversationMetadata(messages, filePath);
              } catch (metaError) {
                console.error(`[FileOps] Failed to extract metadata from archived ${filePath}:`, metaError);
                return null;
              }

              // Skip empty conversations if setting is disabled
              if (!showEmpty && !metadata.hasRealMessages) {
                return null;
              }

              // Get conversation timestamp (matches Claude Code behavior)
              // Priority 2: Use last message timestamp (most recent activity)
              // Priority 3: Fall back to file mtime
              // Note: Skip cross-file summary search (Priority 1) during initial load to avoid O(n²) file parsing
              let lastMessageTime = metadata.lastMessageTime;
              let actualLastMessageTime = metadata.lastMessageTime;

              // Cross-file summary search is skipped during async load
              // This will be populated lazily when needed by the tree item renderer
              // let crossFileSummary: any;
              // try {
              //   crossFileSummary = FileOperations.findCrossFileSummaryWithUuid(filePath);
              // } catch (cfError) {
              //   console.error(`[FileOps] Failed to find cross-file summary for archived ${filePath}:`, cfError);
              //   crossFileSummary = null;
              // }

              // if (crossFileSummary) {
              //   // Find the message with this UUID to get its timestamp
              //   const leafMessage = messages.find(m => 'uuid' in m && m.uuid === crossFileSummary.leafUuid);
              //   if (leafMessage && 'timestamp' in leafMessage && leafMessage.timestamp) {
              //     lastMessageTime = new Date(leafMessage.timestamp);
              //     actualLastMessageTime = lastMessageTime;
              //   }
              // }

              return {
                id: path.parse(file).name,
                title: metadata.title,
                filePath,
                project: projectDir,
                lastModified: stats.mtime,
                lastMessageTime: lastMessageTime,
                actualLastMessageTime: actualLastMessageTime,
                messageCount: messages.length,
                fileSize: stats.size,
                isArchived: true
              };
            } catch (error) {
              console.error(`[FileOps] Unexpected error parsing archived conversation ${filePath}:`, error);
              return null;
            }
          });

        // Wait for all files to be processed in parallel
        const results = await Promise.all(filePromises);
        const validConversations = results.filter((conv): conv is Conversation => conv !== null);
        conversations.push(...validConversations);
      }

      return conversations;
    } catch (error) {
      console.error('Error in getArchivedConversationsAsync:', error);
      return [];
    }
  }

  /**
   * Move conversation to archive
   */
  static archiveConversation(filePath: string, projectName: string): void {
    // Create backup first
    if (this.shouldCreateBackup()) {
      fs.copyFileSync(filePath, `${filePath}.backup`);
    }

    // Create archive directory
    const archiveProjectDir = path.join(FileOperations.ARCHIVE_DIR, projectName);
    if (!fs.existsSync(archiveProjectDir)) {
      fs.mkdirSync(archiveProjectDir, { recursive: true });
    }

    // Move file
    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveProjectDir, fileName);
    fs.renameSync(filePath, archivePath);
  }

  /**
   * Restore conversation from archive
   */
  static restoreConversation(filePath: string, projectName: string): void {
    const projectDir = path.join(FileOperations.PROJECTS_DIR, projectName);

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const fileName = path.basename(filePath);
    const restorePath = path.join(projectDir, fileName);

    fs.renameSync(filePath, restorePath);
  }

  /**
   * Delete conversation permanently
   */
  static deleteConversation(filePath: string): void {
    // Create backup first
    if (this.shouldCreateBackup()) {
      fs.copyFileSync(filePath, `${filePath}.backup`);
    }

    fs.unlinkSync(filePath);
  }

  /**
   * Search conversations by content (full-text search)
   */
  static searchConversations(query: string, includeArchived: boolean = true, filterToCurrentProject: boolean = true): Array<{conversation: Conversation, matches: string[]}> {
    const results: Array<{conversation: Conversation, matches: string[]}> = [];
    const lowerQuery = query.toLowerCase();

    // Get conversations (defaults to current project only)
    const conversations = [
      ...FileOperations.getAllConversations(filterToCurrentProject, true),
      ...(includeArchived ? FileOperations.getArchivedConversations(filterToCurrentProject, true) : [])
    ];

    for (const conversation of conversations) {
      const matches: string[] = [];

      // Check title
      if (conversation.title.toLowerCase().includes(lowerQuery)) {
        matches.push(`Title: ${conversation.title}`);
      }

      // Search content
      try {
        const messages = FileOperations.parseConversation(conversation.filePath);

        for (const line of messages) {
          // Skip metadata and non-conversation messages
          if ('_metadata' in line || !FileOperations.isConversationMessage(line)) {
            continue;
          }

          // Skip sidechain
          if (line.isSidechain) {
            continue;
          }

          const content = line.message.content;
          let textContent = '';

          if (typeof content === 'string') {
            textContent = content;
          } else if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                textContent += item.text + ' ';
              }
            }
          }

          if (textContent.toLowerCase().includes(lowerQuery)) {
            // Extract snippet around match
            const lowerText = textContent.toLowerCase();
            const matchIndex = lowerText.indexOf(lowerQuery);
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(textContent.length, matchIndex + query.length + 50);
            let snippet = textContent.substring(start, end);

            if (start > 0) snippet = '...' + snippet;
            if (end < textContent.length) snippet = snippet + '...';

            matches.push(`${line.type === 'user' ? '👤' : '🤖'}: ${snippet}`);

            // Limit matches per conversation
            if (matches.length >= 5) break;
          }
        }
      } catch (error) {
        console.error(`Failed to search conversation ${conversation.filePath}:`, error);
      }

      if (matches.length > 0) {
        results.push({ conversation, matches });
      }
    }

    return results;
  }

  /**
   * Export conversation to markdown format
   */
  static exportToMarkdown(filePath: string): string {
    const messages = FileOperations.parseConversation(filePath);
    const title = FileOperations.getConversationTitle(filePath);

    let markdown = `# ${title}\n\n`;
    markdown += `*Exported from Claude Code on ${new Date().toLocaleString()}*\n\n`;
    markdown += '---\n\n';

    for (const line of messages) {
      // Skip metadata and non-conversation messages
      if ('_metadata' in line || !FileOperations.isConversationMessage(line)) {
        continue;
      }

      // Skip sidechain messages
      if (line.isSidechain) {
        continue;
      }

      const role = line.type === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n`;

      const content = line.message.content;

      if (typeof content === 'string') {
        markdown += `${content}\n\n`;
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            markdown += `${item.text}\n\n`;
          } else if (item.type === 'tool_use') {
            markdown += `\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\n`;
          }
        }
      }

      markdown += '---\n\n';
    }

    return markdown;
  }

  /**
   * Check if a conversation has a stale leafUuid in its summary
   * A leafUuid is stale if it doesn't point to the actual last non-sidechain message
   * Returns the correct leafUuid if stale, null if current or no summary exists
   */
  static checkForStaleLeafUuid(filePath: string): string | null {
    try {
      const summaries = this.findSummaryMessages(filePath);

      if (summaries.length === 0) {
        // No summary, nothing to check
        return null;
      }

      // Get the actual last non-sidechain message UUID
      const actualLastUuid = this.findLastNonSidechainMessageUuid(filePath);

      if (!actualLastUuid) {
        // No non-sidechain messages, can't validate
        return null;
      }

      // Check first summary (the one Claude Code uses)
      const summary = summaries[0].summary;

      if (!summary.leafUuid) {
        // Summary has no leafUuid, nothing to check
        return null;
      }

      // Check if leafUuid points to actual last message
      if (summary.leafUuid !== actualLastUuid) {
        return actualLastUuid;
      }

      // leafUuid is current
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Auto-update stale leafUuid in conversation summary
   * Called by file watcher when conversation files are modified
   * Returns true if an update was made
   */
  static autoUpdateStaleLeafUuid(filePath: string): boolean {
    try {
      const correctLeafUuid = this.checkForStaleLeafUuid(filePath);

      if (!correctLeafUuid) {
        // No update needed
        return false;
      }

      // Read file
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Find and update first summary
      const summaries = this.findSummaryMessages(filePath);

      if (summaries.length === 0) {
        // No summary to update (shouldn't happen based on checkForStaleLeafUuid)
        return false;
      }

      const targetSummary = summaries[0];

      // Update the summary with correct leafUuid
      const updatedSummary: SummaryMessage = {
        type: 'summary',
        summary: targetSummary.summary.summary, // Keep existing title
        leafUuid: correctLeafUuid
      };

      lines[targetSummary.lineIndex] = JSON.stringify(updatedSummary);

      // Write back to file (no backup for auto-updates)
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if backups should be created
   */
  private static shouldCreateBackup(): boolean {
    // TODO: Read from VS Code settings
    return true;
  }
}
