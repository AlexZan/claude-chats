import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, Conversation } from './types';

/**
 * Helper class for safe file operations on conversation files
 */
export class FileOperations {
  private static readonly CLAUDE_DIR = path.join(os.homedir(), '.claude');
  private static readonly PROJECTS_DIR = path.join(FileOperations.CLAUDE_DIR, 'projects');
  private static readonly ARCHIVE_DIR = path.join(FileOperations.PROJECTS_DIR, '_archive');

  /**
   * Parse a .jsonl conversation file
   */
  static parseConversation(filePath: string): ConversationMessage[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line) as ConversationMessage;
      } catch (error) {
        throw new Error(`Failed to parse line in ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Get the first meaningful user message (the title)
   * Tries to find real (non-sidechain) messages first
   * Falls back to warmup/sidechain messages if no real messages exist
   */
  static getFirstUserMessage(filePath: string): ConversationMessage | null {
    const messages = FileOperations.parseConversation(filePath);
    let firstUserMessage: ConversationMessage | null = null;
    let firstSidechainMessage: ConversationMessage | null = null;

    for (const message of messages) {
      // Skip metadata
      if ('_metadata' in message) {
        continue;
      }

      // Skip if no message content
      if (!message.message || !message.message.content) {
        continue;
      }

      // Get the text content
      const content = message.message.content;
      let text = '';

      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            text += item.text;
          }
        }
      }

      // Skip if empty
      if (!text.trim()) {
        continue;
      }

      // Skip if it's a system metadata message
      if (/^<(ide_|system-|user-|command-)/.test(text.trim())) {
        continue;
      }

      // Handle sidechain (warmup) messages separately - use as fallback only
      if (message.isSidechain) {
        if (!firstSidechainMessage) {
          firstSidechainMessage = message;
        }
        continue;
      }

      // Found a real (non-sidechain) message!
      // For renamed conversations, the first user message is the title
      // For others, return the first real message we find
      if (message.type === 'user' && !firstUserMessage) {
        firstUserMessage = message;
      }

      // Always return the first real message (could be user or assistant)
      return message;
    }

    // Fallback to first user message (could be from renamed conversation)
    if (firstUserMessage) {
      return firstUserMessage;
    }

    // Last resort: use first sidechain message (warmup)
    if (firstSidechainMessage) {
      return firstSidechainMessage;
    }

    return null;
  }

  /**
   * Check if conversation has any content (including sidechain/warmup messages)
   * This allows warmup-only conversations to be displayed (matching Claude Code behavior)
   */
  static hasRealMessages(filePath: string): boolean {
    try {
      const messages = FileOperations.parseConversation(filePath);

      // Look for ANY non-system message, including sidechain (warmup)
      for (const message of messages) {
        // Skip metadata
        if ('_metadata' in message) {
          continue;
        }

        // Get content
        const content = message.message?.content;
        if (!content) {
          continue;
        }

        let text = '';

        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              text += item.text;
            }
          }
        }

        // Skip if it's a system metadata message
        if (/^<(ide_|system-|user-|command-)/.test(text.trim())) {
          continue;
        }

        // Found a message (real or warmup)
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get conversation title from file
   */
  static getConversationTitle(filePath: string): string {
    const firstMessage = FileOperations.getFirstUserMessage(filePath);

    if (!firstMessage) {
      console.log('[FileOperations] No first message found for:', filePath);
      return 'Untitled';
    }

    const content = firstMessage.message.content;
    console.log('[FileOperations] Content type:', typeof content, 'Content:', JSON.stringify(content).substring(0, 100));

    // Handle string content
    if (typeof content === 'string') {
      return content.split('\n')[0].substring(0, 100);
    }

    // Handle array content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          return item.text.split('\n')[0].substring(0, 100);
        }
      }
    }

    console.log('[FileOperations] Could not extract title from content');
    return 'Untitled';
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
   * Get current project name from workspace path
   */
  static getCurrentProjectName(): string | null {
    const workspaceFolders = require('vscode').workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      console.log('[FileOperations] No workspace folders found');
      return null;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    console.log('[FileOperations] Workspace path:', workspacePath);

    // Convert path to Claude's project directory format
    // e.g., "D:\Dev\MyProject" -> "d--Dev-MyProject"
    // e.g., "c:\Users\Lex\bot-testa" -> "c--Users-Lex-bot-testa"
    // First handle drive letter (C: -> c--), then replace remaining slashes
    let normalized = workspacePath
      .replace(/^([a-zA-Z]):\\/, (_match: string, drive: string) => drive.toLowerCase() + '--')
      .replace(/^([a-zA-Z]):\//, (_match: string, drive: string) => drive.toLowerCase() + '--')
      .replace(/\\/g, '-')
      .replace(/\//g, '-');

    console.log('[FileOperations] Normalized project name:', normalized);
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

      // Filter to current project if requested
      if (filterToCurrentProject && currentProject && projectDir !== currentProject) {
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
          // Skip empty conversations if setting is disabled
          if (!showEmpty && !FileOperations.hasRealMessages(filePath)) {
            console.log('[FileOperations] Skipping file (no real messages):', file);
            continue;
          }

          const messages = FileOperations.parseConversation(filePath);
          const title = FileOperations.getConversationTitle(filePath);
          console.log('[FileOperations] Found conversation:', title, 'from file:', file);

          conversations.push({
            id: path.parse(file).name,
            title,
            filePath,
            project: projectDir,
            lastModified: stats.mtime,
            messageCount: messages.length,
            fileSize: stats.size,
            isArchived: false
          });
        } catch (error) {
          console.error(`Failed to parse conversation ${filePath}:`, error);
        }
      }
    }

    return conversations;
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
      // Filter to current project if requested
      if (filterToCurrentProject && currentProject && projectDir !== currentProject) {
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
          // Skip empty conversations if setting is disabled
          if (!showEmpty && !FileOperations.hasRealMessages(filePath)) {
            console.log('[FileOperations] Skipping file (no real messages):', file);
            continue;
          }

          const messages = FileOperations.parseConversation(filePath);
          const title = FileOperations.getConversationTitle(filePath);
          console.log('[FileOperations] Found conversation:', title, 'from file:', file);

          conversations.push({
            id: path.parse(file).name,
            title,
            filePath,
            project: projectDir,
            lastModified: stats.mtime,
            messageCount: messages.length,
            fileSize: stats.size,
            isArchived: true
          });
        } catch (error) {
          console.error(`Failed to parse archived conversation ${filePath}:`, error);
        }
      }
    }

    return conversations;
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
  static searchConversations(query: string, includeArchived: boolean = true): Array<{conversation: Conversation, matches: string[]}> {
    const results: Array<{conversation: Conversation, matches: string[]}> = [];
    const lowerQuery = query.toLowerCase();

    // Get all conversations
    const conversations = [
      ...FileOperations.getAllConversations(true, true),
      ...(includeArchived ? FileOperations.getArchivedConversations(true, true) : [])
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

        for (const message of messages) {
          // Skip metadata and sidechain
          if ('_metadata' in message || message.isSidechain) {
            continue;
          }

          const content = message.message.content;
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

            matches.push(`${message.type === 'user' ? '👤' : '🤖'}: ${snippet}`);

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

    for (const message of messages) {
      // Skip metadata and sidechain messages
      if ('_metadata' in message || message.isSidechain) {
        continue;
      }

      const role = message.type === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n`;

      const content = message.message.content;

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
   * Check if backups should be created
   */
  private static shouldCreateBackup(): boolean {
    // TODO: Read from VS Code settings
    return true;
  }
}
