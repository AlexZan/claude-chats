import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, Conversation, ConversationLine, SummaryMessage } from './types';
import { MessageContentExtractor } from './utils/messageContentExtractor';
import { log, logError } from './utils/logUtils';
import { messageCache } from './utils/messageCache';

/**
 * Helper class for safe file operations on conversation files
 */
export class FileOperations {
  private static readonly CLAUDE_DIR = path.join(os.homedir(), '.claude');
  private static readonly PROJECTS_DIR = path.join(FileOperations.CLAUDE_DIR, 'projects');
  private static readonly ARCHIVE_DIR = path.join(FileOperations.PROJECTS_DIR, '_archive');

  /**
   * Cache for cross-file summary lookups to avoid O(n²) file scanning
   * Key: projectDir path, Value: Map of leafUuid -> { summary, leafUuid }
   */
  private static crossFileSummaryCache = new Map<string, Map<string, { summary: string; leafUuid: string }>>();

  /**
   * Centralized filtering patterns and utilities
   * Single source of truth for message filtering logic
   */
  private static readonly WARMUP_PATTERN = /warmup|readiness|initialization|ready|assistant ready|codebase|exploration|introduction|search|repository/i;
  private static readonly SYSTEM_METADATA_PATTERN = /^<(ide_|system-|user-|command-)/;

  /**
   * Check if a summary is a warmup/initialization summary that should be filtered out
   */
  private static isWarmupSummary(summary: string): boolean {
    return this.WARMUP_PATTERN.test(summary);
  }

  /**
   * Check if text content is system metadata that should be filtered from user-visible text
   */
  private static isSystemMetadata(text: string): boolean {
    return this.SYSTEM_METADATA_PATTERN.test(text.trim());
  }

  /**
   * Check if a message is a sidechain message (warmup/initialization)
   */
  private static isSidechainMessage(message: ConversationMessage): boolean {
    return message.isSidechain === true;
  }

  /**
   * Extract user-visible text from message content, filtering out system metadata
   * Handles both string and array content formats
   */
  private static extractUserVisibleText(content: string | Array<{ type: string; text?: string }>): string {
    // Use centralized content extractor
    return MessageContentExtractor.extractTextFromContent(content, {
      filterSystemMetadata: true,
      returnFirstOnly: false,
      joinWith: ' '
    });
  }


  /**
   * Fast metadata extraction for tree view - reads only minimal lines
   * Returns title, hasRealMessages, and isHidden without parsing entire file
   * This is much faster than parsing the entire file for large conversations
   *
   * File structure: Line 1 is usually summary (if exists), lines 2-3 are warmup (sidechain),
   * line 4+ is first real message. We only need ~10 lines max.
   */
  static async extractFastMetadataAsync(filePath: string): Promise<{
    title: string;
    hasRealMessages: boolean;
    isHidden: boolean;
    messageCount: number;
  }> {
    try {
      // Read entire file for message counting
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());

      // For title/hasRealMessages, only parse first 10 lines
      const lines = allLines.slice(0, 10);

      let title = 'Untitled';
      let hasRealMessages = false;
      let isHidden = false;
      let messageCount = 0;
      const messageUuids = new Set<string>();

      // Parse first 10 lines for title and hasRealMessages
      const messages: ConversationLine[] = [];
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as ConversationLine;
          messages.push(msg);

          // Collect message UUIDs for hidden check
          if ('uuid' in msg && msg.uuid) {
            messageUuids.add(msg.uuid);
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      // Check for hasRealMessages (first non-sidechain user message)
      for (const msg of messages) {
        if (FileOperations.isConversationMessage(msg) && !msg.isSidechain) {
          hasRealMessages = true;
          break;
        }
      }

      // Parse ALL lines to count messages and check for hidden status
      for (const line of allLines) {
        try {
          const msg = JSON.parse(line) as ConversationLine;

          // Collect all message UUIDs for hidden check
          if ('uuid' in msg && msg.uuid) {
            messageUuids.add(msg.uuid);
          }

          // Count non-sidechain conversation messages (user and assistant)
          if (FileOperations.isConversationMessage(msg) && !msg.isSidechain) {
            messageCount++;
          }

          // Check for hidden status (summary with external leafUuid)
          if (FileOperations.isSummaryMessage(msg) && msg.leafUuid) {
            if (!messageUuids.has(msg.leafUuid)) {
              isHidden = true;
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      // Extract title from first 10 lines
      // Priority 1: First non-warmup summary found
      // Note: We use the first summary we find, even if its leafUuid points beyond the first 10 lines
      // This ensures renamed conversations work correctly (leafUuid might point to line 50+)
      for (const msg of messages) {
        if (FileOperations.isSummaryMessage(msg)) {
          const summary = msg.summary;

          // Skip warmup summaries
          if (FileOperations.isWarmupSummary(summary)) {
            continue;
          }

          // Use this summary as the title
          // We don't check leafUuid here because:
          // 1. The summary is in the first 10 lines, so it belongs to THIS conversation
          // 2. The leafUuid might point to a message beyond line 10 (normal for longer conversations)
          title = summary;
          break;
        }
      }

      // Priority 2: First user message
      if (title === 'Untitled') {
        const firstUserMsg = FileOperations.getFirstUserMessage(messages);
        if (firstUserMsg) {
          const text = FileOperations.extractText(firstUserMsg);
          if (text) {
            title = text.split('\n')[0].substring(0, 100);
          }
        }
      }

      return { title, hasRealMessages, isHidden, messageCount };
    } catch (error) {
      return { title: 'Untitled', hasRealMessages: false, isHidden: false, messageCount: 0 };
    }
  }

  /**
   * Extract fast metadata from conversation file (synchronous version)
   * Reads only first 10 lines for performance
   * Used by synchronous getAllConversations() and getArchivedConversations()
   */
  static extractFastMetadata(filePath: string): {
    title: string;
    hasRealMessages: boolean;
    isHidden: boolean;
    messageCount: number;
  } {
    try {
      // Read entire file for message counting
      const content = fs.readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());

      // For title/hasRealMessages, only parse first 10 lines
      const lines = allLines.slice(0, 10);

      let title = 'Untitled';
      let hasRealMessages = false;
      let isHidden = false;
      let messageCount = 0;
      const messageUuids = new Set<string>();

      // Parse first 10 lines for title and hasRealMessages
      const messages: ConversationLine[] = [];
      for (const line of lines) {
        try {
          const msg = JSON.parse(line) as ConversationLine;
          messages.push(msg);

          // Collect message UUIDs for hidden check
          if ('uuid' in msg && msg.uuid) {
            messageUuids.add(msg.uuid);
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      // Check for hasRealMessages (first non-sidechain user message)
      for (const msg of messages) {
        if (FileOperations.isConversationMessage(msg) && !msg.isSidechain) {
          hasRealMessages = true;
          break;
        }
      }

      // Parse ALL lines to count messages and check for hidden status
      for (const line of allLines) {
        try {
          const msg = JSON.parse(line) as ConversationLine;

          // Collect all message UUIDs for hidden check
          if ('uuid' in msg && msg.uuid) {
            messageUuids.add(msg.uuid);
          }

          // Count non-sidechain conversation messages (user and assistant)
          if (FileOperations.isConversationMessage(msg) && !msg.isSidechain) {
            messageCount++;
          }

          // Check for hidden status (summary with external leafUuid)
          if (FileOperations.isSummaryMessage(msg) && msg.leafUuid) {
            if (!messageUuids.has(msg.leafUuid)) {
              isHidden = true;
            }
          }
        } catch (e) {
          // Skip malformed lines
        }
      }

      // Extract title from first 10 lines
      // Priority 1: First non-warmup summary found
      for (const msg of messages) {
        if (FileOperations.isSummaryMessage(msg)) {
          const summary = msg.summary;

          // Skip warmup summaries
          if (FileOperations.isWarmupSummary(summary)) {
            continue;
          }

          // Use this summary as the title
          title = summary;
          break;
        }
      }

      // Priority 2: First user message
      if (title === 'Untitled') {
        const firstUserMsg = FileOperations.getFirstUserMessage(messages);
        if (firstUserMsg) {
          const text = FileOperations.extractText(firstUserMsg);
          if (text) {
            title = text.split('\n')[0].substring(0, 100);
          }
        }
      }

      return { title, hasRealMessages, isHidden, messageCount };
    } catch (error) {
      return { title: 'Untitled', hasRealMessages: false, isHidden: false, messageCount: 0 };
    }
  }

  /**
   * Parse JSONL content into ConversationLine objects
   * Shared logic used by both sync and async parse methods
   */
  private static parseJSONLContent(content: string, filePath: string): ConversationLine[] {
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
   * Parse a .jsonl conversation file (synchronous)
   * Uses message cache to avoid re-parsing during search operations
   */
  static parseConversation(filePath: string, useCache: boolean = true): ConversationLine[] {
    // Check cache first if enabled
    if (useCache) {
      try {
        const stats = fs.statSync(filePath);
        const mtime = stats.mtimeMs;
        const cached = messageCache.get(filePath, mtime);

        if (cached) {
          return cached;
        }

        // Cache miss - parse and store
        const content = fs.readFileSync(filePath, 'utf-8');
        const messages = FileOperations.parseJSONLContent(content, filePath);
        messageCache.set(filePath, messages, mtime);

        return messages;
      } catch (error) {
        // If cache check fails, fall through to normal parsing
        logError('FileOps', 'Cache check failed, falling back to direct parsing', error);
      }
    }

    // Direct parsing without cache
    const content = fs.readFileSync(filePath, 'utf-8');
    return FileOperations.parseJSONLContent(content, filePath);
  }

  /**
   * Parse a .jsonl conversation file (asynchronous)
   * Recommended for use in async contexts to avoid blocking the UI thread
   */
  static async parseConversationAsync(filePath: string): Promise<ConversationLine[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return FileOperations.parseJSONLContent(content, filePath);
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
        if (FileOperations.isWarmupSummary(summary)) {
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
    // Track candidates for each priority level (single pass)
    let nonSidechainUserMsg: ConversationMessage | null = null;
    let nonSidechainAnyMsg: ConversationMessage | null = null;
    let sidechainAssistantMsg: ConversationMessage | null = null;
    let anyMessageWithContent: ConversationMessage | null = null;

    // Single pass through all messages
    for (const line of messages) {
      // Skip metadata
      if ('_metadata' in line) {
        continue;
      }

      // Only process conversation messages
      if (!FileOperations.isConversationMessage(line)) {
        continue;
      }

      const text = FileOperations.extractText(line);
      const hasContent = !!text;

      // Priority 1: Non-sidechain user message (best case - early exit)
      if (!line.isSidechain && line.type === 'user' && hasContent) {
        // Skip "warmup" text - look for actual conversation content
        if (!/^warmup$/i.test(text.trim())) {
          return line; // Found! Early exit for optimal performance
        }
      }

      // Priority 2: Non-sidechain message of any type (track first occurrence)
      if (!line.isSidechain && hasContent && !nonSidechainAnyMsg) {
        nonSidechainAnyMsg = line;
      }

      // Priority 3: Sidechain assistant message (for warmup-only conversations)
      if (line.isSidechain && line.type === 'assistant' && hasContent && !sidechainAssistantMsg) {
        if (text !== 'Warmup') {
          sidechainAssistantMsg = line;
        }
      }

      // Priority 4: Any message with content (last resort)
      if (hasContent && !anyMessageWithContent) {
        anyMessageWithContent = line;
      }
    }

    // Return best candidate found (priority order)
    return nonSidechainAnyMsg || sidechainAssistantMsg || anyMessageWithContent || null;
  }

  /**
   * Helper: extract user-visible text from a message, skipping system metadata
   * For multi-part messages, returns the first non-system text found
   */
  private static extractText(message: ConversationMessage): string {
    if (!message.message || !message.message.content) {
      return '';
    }

    // Use centralized extraction utility
    return FileOperations.extractUserVisibleText(message.message.content);
  }

  /**
   * Check if parsed messages contain real user content (not just warmup/sidechain/metadata)
   * Shared logic used by both hasRealMessages and hasRealMessagesAsync
   */
  private static checkHasRealMessagesInParsed(messages: ConversationLine[]): boolean {
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

      // Extract user-visible text (filters out system metadata)
      const userVisibleText = FileOperations.extractUserVisibleText(content);

      if (userVisibleText.length > 0) {
        // Found a real (non-sidechain) message with actual user content
        return true;
      }
    }

    return false;
  }

  /**
   * Check if conversation has any real (non-sidechain) user messages
   * Filters out warmup-only conversations that the user never actually started
   */
  static hasRealMessages(filePath: string): boolean {
    try {
      const messages = FileOperations.parseConversation(filePath);
      return FileOperations.checkHasRealMessagesInParsed(messages);
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
      return FileOperations.checkHasRealMessagesInParsed(messages);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if this conversation would be hidden by Claude Code (synchronous)
   * A conversation is hidden if it contains a summary with leafUuid pointing to another file
   */
  static isHiddenInClaudeCode(filePath: string): boolean {
    try {
      const messages = FileOperations.parseConversation(filePath);
      return FileOperations.isHiddenFromMessages(messages);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if this conversation would be hidden by Claude Code (asynchronous)
   * A conversation is hidden if it contains a summary with leafUuid pointing to another file
   */
  static async isHiddenInClaudeCodeAsync(filePath: string): Promise<boolean> {
    try {
      const messages = await FileOperations.parseConversationAsync(filePath);
      return FileOperations.isHiddenFromMessages(messages);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if messages indicate this conversation is hidden in Claude Code
   * A conversation is hidden if it contains a summary with leafUuid pointing to another file
   * This version takes pre-parsed messages to avoid re-parsing during file load
   */
  static isHiddenFromMessages(messages: ConversationLine[]): boolean {
    try {
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
      const projectDir = path.dirname(filePath);

      // Check if we have a cached index for this project directory
      if (!this.crossFileSummaryCache.has(projectDir)) {
        // Build index once for the entire project directory
        const index = this.buildCrossFileSummaryIndex(projectDir);
        this.crossFileSummaryCache.set(projectDir, index);
      }

      const index = this.crossFileSummaryCache.get(projectDir)!;

      // Get all message UUIDs from this file
      const messages = FileOperations.parseConversation(filePath);

      // Check if any of our message UUIDs are referenced by a cross-file summary
      for (const message of messages) {
        if ('uuid' in message && message.uuid) {
          const uuid = message.uuid;
          if (index.has(uuid)) {
            // Found a cross-file summary pointing to this message
            return index.get(uuid)!;
          }
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
   * Build cross-file summary index for a project directory
   * This scans all conversation files ONCE and builds a map of leafUuid -> summary
   * Dramatically improves performance from O(n²) to O(n)
   */
  private static buildCrossFileSummaryIndex(projectDir: string): Map<string, { summary: string; leafUuid: string }> {
    const index = new Map<string, { summary: string; leafUuid: string }>();

    try {
      const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        const filePath = path.join(projectDir, file);

        try {
          const messages = FileOperations.parseConversation(filePath);

          // Look for summary messages with leafUuid
          for (const message of messages) {
            if (FileOperations.isSummaryMessage(message)) {
              const leafUuid = message.leafUuid;
              const summary = message.summary;

              if (leafUuid && summary) {
                // Skip warmup/initialization summaries
                if (!FileOperations.isWarmupSummary(summary)) {
                  // Map leafUuid -> { summary, leafUuid }
                  // If multiple summaries reference same leafUuid, use first non-warmup one
                  if (!index.has(leafUuid)) {
                    index.set(leafUuid, { summary, leafUuid });
                  }
                }
              }
            }
          }
        } catch (error) {
          // Skip files that can't be parsed
          continue;
        }
      }

      log('FileOps', `Built cross-file summary index for ${projectDir}: ${index.size} summaries`);
    } catch (error) {
      logError('FileOps', 'Error building cross-file index:', error);
    }

    return index;
  }

  /**
   * Invalidate cross-file summary cache for a specific project directory
   * Should be called when files in the directory are added/modified/deleted
   */
  static invalidateCrossFileSummaryCache(projectDir: string): void {
    if (this.crossFileSummaryCache.has(projectDir)) {
      log('FileOps', `Invalidating cross-file cache for ${projectDir}`);
      this.crossFileSummaryCache.delete(projectDir);
    }
  }

  /**
   * Clear all cross-file summary caches
   */
  static clearCrossFileSummaryCache(): void {
    log('FileOps', 'Clearing all cross-file caches');
    this.crossFileSummaryCache.clear();
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
          if (FileOperations.isWarmupSummary(summary)) {
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
   * Find the last non-sidechain message UUID in the PRIMARY conversation chain
   *
   * CRITICAL: Claude Code may "compact" conversations after ~100 messages by creating
   * a new root message (type: "system", parentUuid: null) in the middle of the file.
   * This results in multiple conversation chains in the same file.
   *
   * Claude Code expects the leafUuid to point to the FIRST (primary) chain that starts
   * immediately after the summary, NOT to any subsequent compacted chains.
   *
   * @param filePath Path to the conversation file
   * @returns UUID of the last non-sidechain message in the primary chain, or null
   */
  private static findLastNonSidechainMessageUuid(filePath: string): string | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Step 1: Find the primary chain root (first message with parentUuid: null after summary)
    let primaryRootUuid: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      try {
        const message = JSON.parse(lines[i]) as ConversationLine;

        // Skip summary messages
        if (this.isSummaryMessage(message)) {
          continue;
        }

        // Skip metadata
        if ('_metadata' in message) {
          continue;
        }

        // Find first message with parentUuid: null (this is the primary chain root)
        if (this.isConversationMessage(message) && message.parentUuid === null && message.uuid) {
          primaryRootUuid = message.uuid;
          log('findLastNonSidechainMessageUuid', `Found primary chain root: ${primaryRootUuid} at line ${i + 1}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!primaryRootUuid) {
      log('findLastNonSidechainMessageUuid', 'No primary chain root found');
      return null;
    }

    // Step 2: Build UUID index for fast parent lookups
    const uuidIndex = new Map<string, ConversationMessage>();
    for (const line of lines) {
      try {
        const message = JSON.parse(line) as ConversationLine;
        if (this.isConversationMessage(message) && message.uuid) {
          uuidIndex.set(message.uuid, message);
        }
      } catch (error) {
        continue;
      }
    }

    // Step 3: Build set of all UUIDs that belong to the primary chain
    const primaryChainUuids = new Set<string>();
    primaryChainUuids.add(primaryRootUuid);

    // Iteratively add all messages whose parent is in the primary chain
    let foundNew = true;
    while (foundNew) {
      foundNew = false;
      for (const [uuid, message] of uuidIndex) {
        if (primaryChainUuids.has(uuid)) {
          continue; // Already in chain
        }
        if (message.parentUuid && primaryChainUuids.has(message.parentUuid)) {
          primaryChainUuids.add(uuid);
          foundNew = true;
        }
      }
    }

    log('findLastNonSidechainMessageUuid', `Primary chain has ${primaryChainUuids.size} messages`);

    // Step 4: Find the last non-sidechain message in the primary chain by timestamp
    let lastMessage: ConversationMessage | null = null;
    let lastTimestamp = new Date(0);

    for (const uuid of primaryChainUuids) {
      const message = uuidIndex.get(uuid);
      if (!message) continue;

      // Skip sidechain messages
      if (message.isSidechain) {
        continue;
      }

      // Check if this message is newer than our current last
      if (message.timestamp) {
        const ts = new Date(message.timestamp);
        if (ts > lastTimestamp) {
          lastTimestamp = ts;
          lastMessage = message;
        }
      }
    }

    if (lastMessage) {
      log('findLastNonSidechainMessageUuid', `Last message in primary chain: ${lastMessage.uuid}`);
      return lastMessage.uuid;
    }

    log('findLastNonSidechainMessageUuid', 'No non-sidechain messages found in primary chain');
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

        // Invalidate message cache for the other file (it was modified)
        messageCache.invalidate(otherFilePath);

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

    // Invalidate message cache for this file (it was modified)
    messageCache.invalidate(filePath);

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
   * Build a Conversation object from file metadata
   * Shared logic used by both sync and async getAllConversations methods
   *
   * @param file - The filename (not full path)
   * @param filePath - Full path to the conversation file
   * @param projectDir - Project directory name
   * @param stats - File stats object
   * @param fastMetadata - Fast metadata extracted from first 10 lines
   * @param isArchived - Whether this is an archived conversation
   * @returns Conversation object
   */
  private static buildConversationObject(
    file: string,
    filePath: string,
    projectDir: string,
    stats: fs.Stats,
    fastMetadata: { title: string; hasRealMessages: boolean; isHidden: boolean; messageCount: number },
    isArchived: boolean = false
  ): Conversation {
    // Use file mtime for timestamps by default
    // This matches Claude Code's behavior and is fast (no parsing needed)
    let lastMessageTime = stats.mtime;
    let actualLastMessageTime = stats.mtime;

    // Note: Cross-file summary lookup is now O(1) thanks to caching (Issue #17)
    // However, for initial load we skip it to maintain fast performance
    // The tree view can lazily load cross-file summaries if needed

    return {
      id: path.parse(file).name,
      title: fastMetadata.title,
      filePath,
      project: projectDir,
      lastModified: stats.mtime,
      lastMessageTime: lastMessageTime,
      actualLastMessageTime: actualLastMessageTime,
      messageCount: fastMetadata.messageCount,
      fileSize: stats.size,
      isArchived: isArchived,
      hasRealMessages: fastMetadata.hasRealMessages,
      isHidden: fastMetadata.isHidden
    };
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
          // Fast metadata extraction - only reads first 10 lines instead of entire file
          const fastMetadata = FileOperations.extractFastMetadata(filePath);

          // Skip empty conversations if setting is disabled
          if (!showEmpty && !fastMetadata.hasRealMessages) {
            continue;
          }

          // Build conversation object using shared builder method
          const conversation = FileOperations.buildConversationObject(
            file,
            filePath,
            projectDir,
            stats,
            fastMetadata,
            false // isArchived
          );

          conversations.push(conversation);
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
          log('FileOps', `Processing ${jsonlFiles.length} conversation files in parallel...`);
        }

        // Process all files in parallel using Promise.all
        const filePromises = jsonlFiles
          .map(async (file) => {
            const filePath = path.join(projectPath, file);

            try {
              const stats = await fs.promises.stat(filePath);

              // Fast metadata extraction - only reads first 10 lines instead of entire file
              let fastMetadata: { title: string; hasRealMessages: boolean; isHidden: boolean; messageCount: number };
              try {
                fastMetadata = await FileOperations.extractFastMetadataAsync(filePath);
              } catch (metaError) {
                console.error(`[FileOps] Failed to extract metadata from ${filePath}:`, metaError);
                return null;
              }

              // Skip empty conversations if setting is disabled
              if (!showEmpty && !fastMetadata.hasRealMessages) {
                return null;
              }

              // Build conversation object using shared builder method
              return FileOperations.buildConversationObject(
                file,
                filePath,
                projectDir,
                stats,
                fastMetadata,
                false // isArchived
              );
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

      log('FileOps', `getAllConversationsAsync finished with ${conversations.length} conversations`);
      return conversations;
    } catch (error) {
      logError('FileOps', 'Error in getAllConversationsAsync:', error);
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
          // Fast metadata extraction - only reads first 10 lines instead of entire file
          const fastMetadata = FileOperations.extractFastMetadata(filePath);

          // Skip empty conversations if setting is disabled
          if (!showEmpty && !fastMetadata.hasRealMessages) {
            continue;
          }

          // Build conversation object using shared builder method
          const conversation = FileOperations.buildConversationObject(
            file,
            filePath,
            projectDir,
            stats,
            fastMetadata,
            true // isArchived
          );

          conversations.push(conversation);
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

              // Use fast metadata extraction (only reads first 10 lines)
              let fastMetadata: { title: string; hasRealMessages: boolean; isHidden: boolean; messageCount: number };
              try {
                fastMetadata = await FileOperations.extractFastMetadataAsync(filePath);
              } catch (metaError) {
                console.error(`[FileOps] Failed to extract metadata from archived ${filePath}:`, metaError);
                return null;
              }

              // Skip empty conversations if setting is disabled
              if (!showEmpty && !fastMetadata.hasRealMessages) {
                return null;
              }

              // Build conversation object using shared builder method
              return FileOperations.buildConversationObject(
                file,
                filePath,
                projectDir,
                stats,
                fastMetadata,
                true // isArchived
              );
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

    // Invalidate cache for old path (file moved)
    messageCache.invalidate(filePath);
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

    // Invalidate cache for old path (file moved)
    messageCache.invalidate(filePath);
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

    // Invalidate cache for deleted file
    messageCache.invalidate(filePath);
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
      log('checkForStaleLeafUuid', `Checking ${filePath}`);
      log('checkForStaleLeafUuid', `Found ${summaries.length} summaries`);

      if (summaries.length === 0) {
        // No summary, nothing to check
        log('checkForStaleLeafUuid', 'No summaries found');
        return null;
      }

      // Get the actual last non-sidechain message UUID
      const actualLastUuid = this.findLastNonSidechainMessageUuid(filePath);
      log('checkForStaleLeafUuid', `Actual last UUID: ${actualLastUuid}`);

      if (!actualLastUuid) {
        // No non-sidechain messages, can't validate
        log('checkForStaleLeafUuid', 'No non-sidechain messages found');
        return null;
      }

      // Check first summary (the one Claude Code uses)
      const summary = summaries[0].summary;
      log('checkForStaleLeafUuid', `Summary leafUuid: ${summary.leafUuid}`);
      log('checkForStaleLeafUuid', `Summary title: ${summary.summary}`);

      if (!summary.leafUuid) {
        // Summary has no leafUuid, nothing to check
        log('checkForStaleLeafUuid', 'Summary has no leafUuid');
        return null;
      }

      // Check if leafUuid points to actual last message
      if (summary.leafUuid !== actualLastUuid) {
        log('checkForStaleLeafUuid', `STALE! Returning correct UUID: ${actualLastUuid}`);
        return actualLastUuid;
      }

      // leafUuid is current
      log('checkForStaleLeafUuid', 'leafUuid is current');
      return null;
    } catch (error) {
      log('checkForStaleLeafUuid', `Error: ${error}`);
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
      log('autoUpdateStaleLeafUuid', `Starting update for: ${filePath}`);

      const correctLeafUuid = this.checkForStaleLeafUuid(filePath);
      log('autoUpdateStaleLeafUuid', `Correct leafUuid: ${correctLeafUuid}`);

      if (!correctLeafUuid) {
        // No update needed
        log('autoUpdateStaleLeafUuid', 'No update needed');
        return false;
      }

      // Read file ONCE to avoid race conditions
      log('autoUpdateStaleLeafUuid', 'Reading file...');
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      log('autoUpdateStaleLeafUuid', `File has ${lines.length} lines`);

      // Find first summary in the SAME data we just read (don't re-read file!)
      let summaryLineIndex = -1;
      let summaryData: SummaryMessage | null = null;

      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const msg = JSON.parse(line) as ConversationLine;
          if (this.isSummaryMessage(msg)) {
            summaryLineIndex = i;
            summaryData = msg;
            log('autoUpdateStaleLeafUuid', `Found summary at line ${i}: "${msg.summary}"`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (summaryLineIndex === -1 || !summaryData) {
        log('autoUpdateStaleLeafUuid', 'No summary found in file');
        return false;
      }

      // Update the summary with correct leafUuid
      const updatedSummary: SummaryMessage = {
        type: 'summary',
        summary: summaryData.summary, // Keep existing title
        leafUuid: correctLeafUuid
      };

      log('autoUpdateStaleLeafUuid', `Updating line ${summaryLineIndex} with new leafUuid`);
      lines[summaryLineIndex] = JSON.stringify(updatedSummary);

      // Write back to file atomically
      log('autoUpdateStaleLeafUuid', 'Writing file...');
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      log('autoUpdateStaleLeafUuid', 'Update complete!');

      return true;
    } catch (error) {
      logError('autoUpdateStaleLeafUuid', 'Error during update', error);
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
