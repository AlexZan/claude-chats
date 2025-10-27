import * as vscode from 'vscode';
import * as path from 'path';
import { Conversation } from './types';
import { FileOperations } from './fileOperations';

/**
 * Tree item representing a time group (Today, Yesterday, etc.)
 */
export class TimeGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly conversations: Conversation[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'timeGroup';
    // No icon - matches Claude Code style
  }
}

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
  private showWarmupOnly: boolean = false;

  constructor() {}

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'newest' ? 'oldest' : 'newest';
    this.refresh();
  }

  getSortOrder(): string {
    return this.sortOrder === 'newest' ? 'Newest First' : 'Oldest First';
  }

  toggleWarmupFilter(): void {
    this.showWarmupOnly = !this.showWarmupOnly;
    this.refresh();
  }

  getWarmupFilterStatus(): string {
    return this.showWarmupOnly ? 'Showing Warmup Conversations' : 'Hiding Warmup Conversations';
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

    if (element instanceof TimeGroupTreeItem) {
      return element.conversations.map(
        conv => new ConversationTreeItem(conv, vscode.TreeItemCollapsibleState.None)
      );
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

    // Get all conversations, then filter based on warmup filter
    const allConversations = FileOperations.getAllConversations(true, true);

    // Filter out warmup-only conversations unless user wants to see them
    const conversations = this.showWarmupOnly
      ? allConversations
      : allConversations.filter(conv => showEmpty || FileOperations.hasRealMessages(conv.filePath));

    // Sort by last message time (always newest first for grouping)
    // Use actualLastMessageTime as tiebreaker when display times are the same
    conversations.sort((a, b) => {
      const timeDiff = b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      // Tiebreaker: use actual last message time (more recent activity first)
      return b.actualLastMessageTime.getTime() - a.actualLastMessageTime.getTime();
    });

    // Group by time periods
    const timeGroups = this.groupByTimePeriod(conversations);

    // Convert to tree items
    const items: vscode.TreeItem[] = [];
    for (const [label, convos] of timeGroups) {
      if (convos.length > 0) {
        items.push(new TimeGroupTreeItem(label, convos));
      }
    }

    return items;
  }

  private groupByTimePeriod(conversations: Conversation[]): Map<string, Conversation[]> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const groups = new Map<string, Conversation[]>([
      ['Today', []],
      ['Yesterday', []],
      ['Past week', []],
      ['Past month', []],
      ['Older', []]
    ]);

    for (const conv of conversations) {
      const time = conv.lastMessageTime;

      if (time >= todayStart) {
        groups.get('Today')!.push(conv);
      } else if (time >= yesterdayStart) {
        groups.get('Yesterday')!.push(conv);
      } else if (time >= weekStart) {
        groups.get('Past week')!.push(conv);
      } else if (time >= monthStart) {
        groups.get('Past month')!.push(conv);
      } else {
        groups.get('Older')!.push(conv);
      }
    }

    return groups;
  }

  private async getArchivedConversationItems(): Promise<vscode.TreeItem[]> {
    const config = vscode.workspace.getConfiguration('claudeCodeConversationManager');
    const showEmpty = config.get<boolean>('showEmptyConversations', false);

    // Get all conversations, then filter based on warmup filter
    const allConversations = FileOperations.getArchivedConversations(true, true);

    // Filter out warmup-only conversations unless user wants to see them
    const conversations = this.showWarmupOnly
      ? allConversations
      : allConversations.filter(conv => showEmpty || FileOperations.hasRealMessages(conv.filePath));

    if (conversations.length === 0) {
      const item = new vscode.TreeItem('No archived conversations', vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'empty';
      return [item];
    }

    // Sort by last message time (always newest first for grouping)
    // Use actualLastMessageTime as tiebreaker when display times are the same
    conversations.sort((a, b) => {
      const timeDiff = b.lastMessageTime.getTime() - a.lastMessageTime.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      // Tiebreaker: use actual last message time (more recent activity first)
      return b.actualLastMessageTime.getTime() - a.actualLastMessageTime.getTime();
    });

    // Group by time periods
    const timeGroups = this.groupByTimePeriod(conversations);

    // Convert to tree items
    const items: vscode.TreeItem[] = [];
    for (const [label, convos] of timeGroups) {
      if (convos.length > 0) {
        items.push(new TimeGroupTreeItem(label, convos));
      }
    }

    return items;
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
