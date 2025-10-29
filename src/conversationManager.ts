import * as vscode from 'vscode';
import { FileOperations } from './fileOperations';
import { Conversation } from './types';
import { ConversationViewer } from './conversationViewer';

/**
 * Core business logic for managing conversations
 */
export class ConversationManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Rename a conversation using summary-based approach
   */
  async rename(conversation: Conversation, newTitle: string): Promise<void> {
    try {
      FileOperations.updateConversationTitle(conversation.filePath, newTitle);
      vscode.window.showInformationMessage(`Renamed conversation to: ${newTitle}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename conversation: ${error}`);
      throw error;
    }
  }

  /**
   * Archive a conversation
   */
  async archive(conversation: Conversation): Promise<void> {
    try {
      // Check if conversation file is currently open
      const isOpen = vscode.workspace.textDocuments.some(
        doc => doc.fileName === conversation.filePath
      );

      if (isOpen) {
        const proceed = await vscode.window.showWarningMessage(
          'This conversation file is currently open. Archiving may cause unexpected behavior. Continue?',
          'Archive Anyway',
          'Cancel'
        );

        if (proceed !== 'Archive Anyway') {
          return;
        }
      }

      // Confirm if setting is enabled
      const config = vscode.workspace.getConfiguration('claudeCodeConversationManager');
      const confirmArchive = config.get<boolean>('confirmArchive', true);

      if (confirmArchive) {
        const action = await vscode.window.showInformationMessage(
          `Archive conversation "${conversation.title}"?`,
          'Archive',
          'Cancel'
        );

        if (action !== 'Archive') {
          return;
        }
      }

      FileOperations.archiveConversation(conversation.filePath, conversation.project);
      vscode.window.showInformationMessage(
        `Archived conversation: ${conversation.title}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to archive conversation: ${error}`);
      throw error;
    }
  }

  /**
   * Restore a conversation from archive
   */
  async restore(conversation: Conversation): Promise<void> {
    try {
      FileOperations.restoreConversation(conversation.filePath, conversation.project);
      vscode.window.showInformationMessage(
        `Restored conversation: ${conversation.title}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to restore conversation: ${error}`);
      throw error;
    }
  }

  /**
   * Toggle done status (✓ prefix) using summary-based approach
   */
  async toggleDone(conversation: Conversation): Promise<void> {
    try {
      const isDone = conversation.title.startsWith('✓');
      let newTitle: string;

      if (isDone) {
        // Remove ✓ prefix
        newTitle = conversation.title.replace(/^✓\s*/, '');
      } else {
        // Add ✓ prefix
        newTitle = `✓ ${conversation.title}`;
      }

      FileOperations.updateConversationTitle(conversation.filePath, newTitle);
      vscode.window.showInformationMessage(
        isDone ? `Marked as undone: ${newTitle}` : `Marked as done: ${newTitle}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to toggle done status: ${error}`);
      throw error;
    }
  }

  /**
   * Delete a conversation permanently
   */
  async delete(conversation: Conversation): Promise<void> {
    try {
      const action = await vscode.window.showWarningMessage(
        `Permanently delete conversation "${conversation.title}"? This cannot be undone.`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      if (action !== 'Delete') {
        return;
      }

      FileOperations.deleteConversation(conversation.filePath);
      vscode.window.showInformationMessage(
        `Deleted conversation: ${conversation.title}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete conversation: ${error}`);
      throw error;
    }
  }

  /**
   * Get current conversation ID (from active editor if it's a .jsonl file)
   */
  getCurrentConversationId(): string | null {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
      return null;
    }

    const filePath = activeEditor.document.fileName;

    if (!filePath.endsWith('.jsonl')) {
      return null;
    }

    // Extract conversation ID from filename
    const fileName = filePath.split(/[/\\]/).pop();
    return fileName ? fileName.replace('.jsonl', '') : null;
  }

  /**
   * Search conversations (full-text search)
   */
  async searchConversations(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search conversations (searches both titles and content)',
      placeHolder: 'Enter search query...'
    });

    if (!query || !query.trim()) {
      return;
    }

    // Show progress indicator while searching
    const results = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Searching conversations for "${query.trim()}"...`,
      cancellable: false
    }, async (progress) => {
      try {
        return FileOperations.searchConversations(query.trim());
      } catch (error) {
        console.error('[SearchConversations] Error during search:', error);
        vscode.window.showErrorMessage(`Search failed: ${error}`);
        return [];
      }
    });

    if (results.length === 0) {
      vscode.window.showInformationMessage(`No conversations found matching "${query}"`);
      return;
    }

    // Show results in quick pick
    const items = results.map(result => ({
      label: result.conversation.title,
      description: result.conversation.isArchived ? '📦 Archived' : '',
      detail: result.matches.join('\n'),
      conversation: result.conversation
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Found ${results.length} conversation(s) matching "${query}"`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      // Open the conversation in the viewer
      ConversationViewer.show(this.context.extensionUri, selected.conversation.filePath);
    }
  }

  /**
   * Export conversation to markdown
   */
  async exportToMarkdown(conversation: Conversation): Promise<void> {
    try {
      const markdown = FileOperations.exportToMarkdown(conversation.filePath);

      // Ask user where to save
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${conversation.title}.md`),
        filters: {
          'Markdown': ['md']
        }
      });

      if (!uri) {
        return;
      }

      // Write markdown file
      await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown, 'utf-8'));

      const action = await vscode.window.showInformationMessage(
        `Exported to: ${uri.fsPath}`,
        'Open File'
      );

      if (action === 'Open File') {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export conversation: ${error}`);
      throw error;
    }
  }

  /**
   * Find conversation by ID
   */
  findConversationById(conversationId: string): Conversation | null {
    const allConversations = [
      ...FileOperations.getAllConversations(),
      ...FileOperations.getArchivedConversations()
    ];

    return allConversations.find(c => c.id === conversationId) || null;
  }

  /**
   * Find conversations by title (for fuzzy matching from tab labels)
   * Handles truncated titles from Claude Code tabs
   */
  findConversationsByTitle(tabLabel: string): Conversation[] {
    const allConversations = [
      ...FileOperations.getAllConversations(),
      ...FileOperations.getArchivedConversations()
    ];

    // Remove ellipsis if present (Claude truncates with "…")
    const cleanLabel = tabLabel.replace(/…$/, '').trim();

    if (!cleanLabel) {
      return [];
    }

    // Try exact match first (when title fits in tab)
    const exactMatch = allConversations.find(c => c.title === cleanLabel);
    if (exactMatch) {
      return [exactMatch];
    }

    // Try prefix match (for truncated titles like "i found a big problem, t…")
    const prefixMatches = allConversations.filter(c =>
      c.title.startsWith(cleanLabel)
    );

    if (prefixMatches.length > 0) {
      return prefixMatches;
    }

    // Fallback: case-insensitive partial match
    const lowerLabel = cleanLabel.toLowerCase();
    const partialMatches = allConversations.filter(c =>
      c.title.toLowerCase().includes(lowerLabel)
    );

    return partialMatches;
  }

  /**
   * Detect or select the current conversation
   * Returns the conversation or null if user cancelled
   */
  async detectOrSelectConversation(): Promise<Conversation | null> {
    const { getActiveClaudeCodeChatTab, getChatTitleFromTab } = require('./claudeCodeDetection');

    // Try 1: Check if .jsonl file is open in text editor
    const conversationId = this.getCurrentConversationId();
    if (conversationId) {
      const conversation = this.findConversationById(conversationId);
      if (conversation) {
        return conversation;
      }
    }

    // Try 2: Check if Claude Code chat tab is active
    const claudeTab = getActiveClaudeCodeChatTab();
    if (claudeTab) {
      const tabLabel = getChatTitleFromTab(claudeTab);
      const matches = this.findConversationsByTitle(tabLabel);

      if (matches.length === 1) {
        // Single match - high confidence
        return matches[0];
      } else if (matches.length > 1) {
        // Multiple matches - show picker to disambiguate
        const items = matches.map(c => ({
          label: c.title,
          description: c.isArchived ? '📦 Archived' : '',
          detail: `Last modified: ${c.lastModified.toLocaleString()}`,
          conversation: c
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `Multiple conversations match "${tabLabel}". Select one:`,
          matchOnDescription: true
        });

        return selected ? selected.conversation : null;
      }
    }

    // Try 3: No match found - show all conversations sorted by recent
    const allConversations = [
      ...FileOperations.getAllConversations(),
      ...FileOperations.getArchivedConversations()
    ];

    if (allConversations.length === 0) {
      vscode.window.showErrorMessage('No conversations found.');
      return null;
    }

    // Sort by last modified (most recent first)
    allConversations.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    const items = allConversations.map(c => ({
      label: c.title,
      description: c.isArchived ? '📦 Archived' : '',
      detail: `Last modified: ${c.lastModified.toLocaleString()}`,
      conversation: c
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a conversation',
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selected ? selected.conversation : null;
  }
}
