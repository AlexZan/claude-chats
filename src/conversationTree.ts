import * as vscode from 'vscode';
import * as path from 'path';
import { Conversation } from './types';
import { FileOperations } from './fileOperations';
import { log, logError } from './utils/logUtils';
import { normalizePath } from './utils/pathUtils';
import { groupByTimePeriod, getTimePeriods, TimePeriod } from './utils/dateUtils';
import { messageCache } from './utils/messageCache';

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
    // Truncate title: first line only, max 60 characters with ellipsis
    const displayTitle = ConversationTreeItem.truncateTitle(conversation.title);
    super(displayTitle, collapsibleState);

    // Use cached isHidden property (calculated during file load to avoid re-parsing)
    const isHidden = conversation.isHidden;

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

  /**
   * Truncate title to match Claude Code's display format
   * - First line only (no newlines)
   * - Max length customizable (default 60 for tree view)
   * - Add ellipsis if truncated
   */
  public static truncateTitle(title: string, maxLength: number = 60): string {
    // Get first line only
    const firstLine = title.split('\n')[0];

    // Truncate if too long
    if (firstLine.length > maxLength) {
      return firstLine.substring(0, maxLength) + '...';
    }

    return firstLine;
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
    return `${conversation.messageCount} msgs • ${relativeTime}`;
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
  private isLoading: boolean = false;
  private pendingRefresh: boolean = false;
  private loadCompletedTime: number = 0;
  private readonly LOAD_GRACE_PERIOD = 2000; // 2 seconds after load to ignore file events

  // Cache for conversations to avoid repeated file I/O
  private conversationCache: Map<string, Conversation[]> = new Map();
  private archivedConversationCache: Map<string, Conversation[]> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 60 second cache validity

  constructor() {}

  /**
   * Check if the tree is currently loading conversations or within grace period after load
   */
  isCurrentlyLoading(): boolean {
    if (this.isLoading) {
      return true;
    }

    // Also return true if we're within the grace period after load completed
    const timeSinceLoad = Date.now() - this.loadCompletedTime;
    return timeSinceLoad < this.LOAD_GRACE_PERIOD;
  }

  /**
   * Mark the tree as loading (prevents file watcher refreshes during initial load)
   */
  setLoading(isLoading: boolean): void {
    log('TreeProvider', `setLoading: ${isLoading}`);
    this.isLoading = isLoading;

    // Record when load completed
    if (!isLoading) {
      this.loadCompletedTime = Date.now();
    }

    // If we were loading and now finished, check if a refresh was pending
    if (!isLoading && this.pendingRefresh) {
      log('TreeProvider', 'Pending refresh triggered after load completed');
      this.pendingRefresh = false;
      this.refresh();
    }
  }

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

  refresh(invalidateCache: boolean = true): void {
    // If we're currently loading, queue the refresh for after load completes
    if (this.isLoading) {
      log('TreeProvider', 'Refresh requested during load, queuing for later');
      this.pendingRefresh = true;
      return;
    }

    if (invalidateCache) {
      this.invalidateCache();
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Invalidate the conversation cache (called on file changes or user actions)
   */
  private invalidateCache(): void {
    this.conversationCache.clear();
    this.archivedConversationCache.clear();
    this.cacheTimestamp = 0;

    // Also clear message cache when invalidating conversation cache
    messageCache.clear();
  }

  /**
   * Update a single conversation in the cache without reloading everything
   * This is much faster than invalidating the entire cache
   */
  async updateSingleConversation(filePath: string): Promise<void> {
    try {
      // Extract fast metadata for the updated file
      const metadata = await FileOperations.extractFastMetadataAsync(filePath);
      const stats = await require('fs').promises.stat(filePath);
      const path = require('path');

      // Create updated conversation object
      const updatedConversation: Conversation = {
        id: path.parse(filePath).name,
        title: metadata.title,
        filePath: filePath,
        project: path.basename(path.dirname(filePath)),
        lastModified: stats.mtime,
        lastMessageTime: stats.mtime,
        actualLastMessageTime: stats.mtime,
        messageCount: metadata.messageCount,
        fileSize: stats.size,
        isArchived: filePath.includes('_archive'),
        hasRealMessages: metadata.hasRealMessages,
        isHidden: metadata.isHidden
      };

      // Update in the appropriate cache
      let cacheUpdated = false;
      if (updatedConversation.isArchived) {
        const archiveCacheKey = `archived_${this.showWarmupOnly}`;
        const archivedCache = this.archivedConversationCache.get(archiveCacheKey);
        if (archivedCache) {
          // Use centralized path normalization
          const normalizedFilePath = normalizePath(filePath);
          const index = archivedCache.findIndex(c => normalizePath(c.filePath) === normalizedFilePath);
          if (index !== -1) {
            archivedCache[index] = updatedConversation;
            cacheUpdated = true;
          }
        }
      } else {
        const activeCacheKey = `active_${this.showWarmupOnly}`;
        const activeCache = this.conversationCache.get(activeCacheKey);
        if (activeCache) {
          // Use centralized path normalization
          const normalizedFilePath = normalizePath(filePath);
          const index = activeCache.findIndex(c => normalizePath(c.filePath) === normalizedFilePath);
          if (index !== -1) {
            activeCache[index] = updatedConversation;
            cacheUpdated = true;
          }
        }
      }

      if (cacheUpdated) {
        // Fire refresh without invalidating cache - VS Code will use the updated cache
        this._onDidChangeTreeData.fire();
      } else {
        // Cache doesn't exist or conversation not in cache - do full refresh
        this.invalidateCache();
        this._onDidChangeTreeData.fire();
      }
    } catch (error) {
      logError('TreeProvider', `Failed to update single conversation ${filePath}:`, error);
      // Fall back to full refresh on error
      this.invalidateCache();
      this._onDidChangeTreeData.fire();
    }
  }

  /**
   * Invalidate cache for a specific file path
   */
  invalidateCacheForFile(filePath: string): void {
    // Clear entire cache since a file change might affect cross-file references
    this.invalidateCache();
  }

  /**
   * Check if cache is still valid (hasn't expired)
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.CACHE_TTL;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level: Show "Active" and "Archived" sections
      // Mark as loading when expanding root to show initial content
      this.setLoading(true);
      return [
        new vscode.TreeItem('Active Conversations', vscode.TreeItemCollapsibleState.Expanded),
        new vscode.TreeItem('Archived Conversations', vscode.TreeItemCollapsibleState.Collapsed)
      ];
    }

    if (element.label === 'Active Conversations') {
      try {
        return await this.getActiveConversationItems();
      } finally {
        // Mark load as complete once we've fetched the items
        this.setLoading(false);
      }
    }

    if (element.label === 'Archived Conversations') {
      try {
        return await this.getArchivedConversationItems();
      } finally {
        // Mark load as complete once we've fetched the items
        this.setLoading(false);
      }
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
    return this.getConversationItems(
      'active',
      this.conversationCache,
      () => FileOperations.getAllConversationsAsync(true, true),
      false // showEmptyPlaceholder
    );
  }

  /**
   * Generic method to get conversation items (reduces duplication)
   * @param cachePrefix - Prefix for cache key ('active' or 'archived')
   * @param cache - Cache to use (conversationCache or archivedConversationCache)
   * @param fetchFn - Function to fetch conversations
   * @param showEmptyPlaceholder - Whether to show "No X conversations" placeholder when empty
   */
  private async getConversationItems(
    cachePrefix: string,
    cache: Map<string, Conversation[]>,
    fetchFn: () => Promise<Conversation[]>,
    showEmptyPlaceholder: boolean
  ): Promise<vscode.TreeItem[]> {
    const cacheKey = `${cachePrefix}_${this.showWarmupOnly}`;

    // Check cache validity
    if (this.isCacheValid() && cache.has(cacheKey)) {
      const cachedConversations = cache.get(cacheKey)!;
      if (showEmptyPlaceholder && cachedConversations.length === 0) {
        const item = new vscode.TreeItem(`No ${cachePrefix} conversations`, vscode.TreeItemCollapsibleState.None);
        item.contextValue = 'empty';
        return [item];
      }
      return this.buildTreeItemsFromConversations(cachedConversations);
    }

    const config = vscode.workspace.getConfiguration('claudeCodeConversationManager');
    const showEmpty = config.get<boolean>('showEmptyConversations', false);

    // Get all conversations asynchronously, then filter based on warmup filter
    const allConversations = await fetchFn();
    log('TreeProvider', `${cachePrefix}: Fetched ${allConversations.length} conversations`);

    // Filter out warmup-only conversations unless user wants to see them
    const conversations = this.showWarmupOnly
      ? allConversations
      : allConversations.filter(conv => showEmpty || conv.hasRealMessages);
    log('TreeProvider', `${cachePrefix}: After filtering ${conversations.length} conversations (showWarmupOnly=${this.showWarmupOnly}, showEmpty=${showEmpty})`);

    // Cache the conversations
    cache.set(cacheKey, conversations);
    this.cacheTimestamp = Date.now();

    if (showEmptyPlaceholder && conversations.length === 0) {
      log('TreeProvider', `${cachePrefix}: Showing empty placeholder`);
      const item = new vscode.TreeItem(`No ${cachePrefix} conversations`, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'empty';
      return [item];
    }

    return this.buildTreeItemsFromConversations(conversations);
  }

  /**
   * Build tree items from a list of conversations
   */
  private buildTreeItemsFromConversations(conversations: Conversation[]): vscode.TreeItem[] {
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
    // Use centralized date utility for time period grouping
    return groupByTimePeriod(conversations);
  }

  private async getArchivedConversationItems(): Promise<vscode.TreeItem[]> {
    return this.getConversationItems(
      'archived',
      this.archivedConversationCache,
      () => FileOperations.getArchivedConversationsAsync(true, true),
      true // showEmptyPlaceholder
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
