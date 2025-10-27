import * as vscode from 'vscode';
import * as path from 'path';
import { Conversation } from './types';
import { FileOperations } from './fileOperations';

/**
 * Tree item representing a conversation
 */
export class ConversationTreeItem extends vscode.TreeItem {
  constructor(
    public readonly conversation: Conversation,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(conversation.title, collapsibleState);

    // Check if this conversation is hidden by Claude Code
    const isHidden = FileOperations.isHiddenInClaudeCode(conversation.filePath);

    this.tooltip = this.buildTooltip(isHidden);
    this.description = this.buildDescription(isHidden);
    this.contextValue = conversation.isArchived ? 'archivedConversation' : 'conversation';

    // Use different icon for hidden conversations
    this.iconPath = new vscode.ThemeIcon(
      conversation.isArchived ? 'archive' :
      isHidden ? 'eye-closed' : 'comment-discussion'
    );

    // Make the item clickable - opens the conversation file when clicked
    this.command = {
      command: 'claudeCodeConversationManager.openConversation',
      title: 'Open Conversation',
      arguments: [this.conversation]
    };
  }

  private buildTooltip(isHidden: boolean): string {
    const { conversation } = this;
    const size = this.formatFileSize(conversation.fileSize);
    const date = conversation.lastModified.toLocaleString();

    const lines = [
      `Title: ${conversation.title}`,
      `Project: ${conversation.project}`,
      `Messages: ${conversation.messageCount}`,
      `Size: ${size}`,
      `Modified: ${date}`,
      `Path: ${conversation.filePath}`
    ];

    if (isHidden) {
      lines.push('', 'ℹ️ Hidden in Claude Code (linked to another conversation)');
    }

    return lines.join('\n');
  }

  private buildDescription(isHidden: boolean): string {
    const { conversation } = this;
    const relativeTime = this.getRelativeTime(conversation.lastModified);
    const hiddenIndicator = isHidden ? '👁️‍🗨️ ' : '';
    return `${hiddenIndicator}${conversation.messageCount} msgs • ${relativeTime}`;
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}

/**
 * Tree item representing a project group
 */
export class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly projectName: string,
    public readonly conversations: Conversation[]
  ) {
    super(projectName, vscode.TreeItemCollapsibleState.Expanded);

    this.description = `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`;
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

/**
 * Tree data provider for conversations
 */
export class ConversationTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private sortOrder: 'newest' | 'oldest' = 'newest';

  constructor() {}

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'newest' ? 'oldest' : 'newest';
    this.refresh();
  }

  getSortOrder(): string {
    return this.sortOrder === 'newest' ? 'Newest First' : 'Oldest First';
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level: Show "Active" and "Archived" sections
      return [
        new vscode.TreeItem('Active Conversations', vscode.TreeItemCollapsibleState.Expanded),
        new vscode.TreeItem('Archived Conversations', vscode.TreeItemCollapsibleState.Collapsed)
      ];
    }

    if (element.label === 'Active Conversations') {
      return this.getActiveConversationItems();
    }

    if (element.label === 'Archived Conversations') {
      return this.getArchivedConversationItems();
    }

    if (element instanceof ProjectTreeItem) {
      return element.conversations.map(
        conv => new ConversationTreeItem(conv, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }

  private async getActiveConversationItems(): Promise<vscode.TreeItem[]> {
    const config = vscode.workspace.getConfiguration('claudeCodeConversationManager');
    const showEmpty = config.get<boolean>('showEmptyConversations', false);

    const conversations = FileOperations.getAllConversations(true, showEmpty);

    // Sort by last modified based on sort order
    if (this.sortOrder === 'newest') {
      conversations.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    } else {
      conversations.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
    }

    // Return conversation items directly (no project grouping)
    return conversations.map(
      conv => new ConversationTreeItem(conv, vscode.TreeItemCollapsibleState.None)
    );
  }

  private async getArchivedConversationItems(): Promise<vscode.TreeItem[]> {
    const config = vscode.workspace.getConfiguration('claudeCodeConversationManager');
    const showEmpty = config.get<boolean>('showEmptyConversations', false);

    const conversations = FileOperations.getArchivedConversations(true, showEmpty);

    if (conversations.length === 0) {
      const item = new vscode.TreeItem('No archived conversations', vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'empty';
      return [item];
    }

    // Sort by last modified based on sort order
    if (this.sortOrder === 'newest') {
      conversations.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    } else {
      conversations.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
    }

    // Return conversation items directly (no project grouping)
    return conversations.map(
      conv => new ConversationTreeItem(conv, vscode.TreeItemCollapsibleState.None)
    );
  }

  private groupConversationsByProject(conversations: Conversation[]): Map<string, Conversation[]> {
    const grouped = new Map<string, Conversation[]>();

    for (const conv of conversations) {
      if (!grouped.has(conv.project)) {
        grouped.set(conv.project, []);
      }
      grouped.get(conv.project)!.push(conv);
    }

    // Sort conversations within each project by last modified (newest first)
    for (const convs of grouped.values()) {
      convs.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    }

    return grouped;
  }
}
