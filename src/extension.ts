import * as vscode from 'vscode';
import { ConversationTreeProvider, ConversationTreeItem } from './conversationTree';
import { ConversationManager } from './conversationManager';
import { ConversationViewer } from './conversationViewer';
import { getActiveClaudeCodeChatTab, getChatTitleFromTab } from './claudeCodeDetection';
import { FileOperations } from './fileOperations';
import { log } from './utils/logUtils';
import { messageCache } from './utils/messageCache';

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Chats activated');

  // Create tree provider and manager
  const treeProvider = new ConversationTreeProvider();
  const manager = new ConversationManager(context);

  // Register tree view
  const treeView = vscode.window.createTreeView('claudeCodeConversationTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  context.subscriptions.push(treeView);

  // Command: Open conversation in custom viewer when clicked
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.openConversation',
      async (conversation: any) => {
        ConversationViewer.show(context.extensionUri, conversation.filePath);
      }
    )
  );

  // Command: Refresh conversations
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeConversationManager.refreshConversations', () => {
      // Manual refresh - invalidate cache to force full reload
      treeProvider.refresh(true);
      vscode.window.showInformationMessage('Conversations refreshed');
    })
  );

  // Command: Show conversation manager
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeConversationManager.showConversationManager', () => {
      vscode.commands.executeCommand('claudeCodeConversationTree.focus');
    })
  );

  // Command: Search conversations
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeConversationManager.searchConversations', async () => {
      await manager.searchConversations();
    })
  );

  // Command: Toggle sort order
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeConversationManager.toggleSortOrder', () => {
      treeProvider.toggleSortOrder();
      vscode.window.showInformationMessage(`Sorted by: ${treeProvider.getSortOrder()}`);
    })
  );

  // Command: Toggle warmup-only conversations filter
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeConversationManager.toggleWarmupFilter', () => {
      treeProvider.toggleWarmupFilter();
      vscode.window.showInformationMessage(treeProvider.getWarmupFilterStatus());
    })
  );

  // Command: Rename conversation (from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.renameConversation',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        const newTitle = await vscode.window.showInputBox({
          prompt: 'Enter new conversation title',
          value: item.conversation.title,
          validateInput: (value) => {
            return value.trim() ? null : 'Title cannot be empty';
          }
        });

        if (!newTitle) {
          return;
        }

        await manager.rename(item.conversation, newTitle);
        // Use targeted refresh instead of full reload
        await treeProvider.updateSingleConversation(item.conversation.filePath);
      }
    )
  );

  // Command: Rename current conversation (smart - works with Claude Code tabs and .jsonl files)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.renameCurrentConversation',
      async () => {
        let conversation = null;

        // Try 1: Check if .jsonl file is open in text editor (existing behavior)
        const conversationId = manager.getCurrentConversationId();
        if (conversationId) {
          conversation = manager.findConversationById(conversationId);
        }

        // Try 2: Check if Claude Code chat tab is active
        if (!conversation) {
          const claudeTab = getActiveClaudeCodeChatTab();
          if (claudeTab) {
            const tabLabel = getChatTitleFromTab(claudeTab);
            const matches = manager.findConversationsByTitle(tabLabel);

            if (matches.length === 1) {
              // Single match - high confidence
              conversation = matches[0];
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

              if (selected) {
                conversation = selected.conversation;
              } else {
                return; // User cancelled
              }
            }
          }
        }

        // Try 3: No match found - show all conversations sorted by recent
        if (!conversation) {
          const allConversations = [
            ...FileOperations.getAllConversations(),
            ...FileOperations.getArchivedConversations()
          ];

          if (allConversations.length === 0) {
            vscode.window.showErrorMessage('No conversations found.');
            return;
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
            placeHolder: 'Select a conversation to rename',
            matchOnDescription: true,
            matchOnDetail: true
          });

          if (selected) {
            conversation = selected.conversation;
          } else {
            return; // User cancelled
          }
        }

        // Show rename dialog
        if (conversation) {
          const newTitle = await vscode.window.showInputBox({
            prompt: 'Enter new conversation title',
            value: conversation.title,
            validateInput: (value) => {
              return value.trim() ? null : 'Title cannot be empty';
            }
          });

          if (!newTitle) {
            return;
          }

          await manager.rename(conversation, newTitle);
          // Use targeted refresh instead of full reload
          await treeProvider.updateSingleConversation(conversation.filePath);
        }
      }
    )
  );

  // Command: Archive conversation (from tree view)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.archiveConversation',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        await manager.archive(item.conversation);
        treeProvider.refresh();
      }
    )
  );

  // Command: Archive current conversation (from command palette)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.archiveCurrentConversation',
      async () => {
        const conversationId = manager.getCurrentConversationId();

        if (!conversationId) {
          vscode.window.showErrorMessage(
            'No conversation file is currently open. Open a .jsonl file first.'
          );
          return;
        }

        const conversation = manager.findConversationById(conversationId);

        if (!conversation) {
          vscode.window.showErrorMessage(
            'Could not find conversation information for the current file.'
          );
          return;
        }

        await manager.archive(conversation);
        treeProvider.refresh();
      }
    )
  );

  // Command: Restore conversation
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.restoreConversation',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        await manager.restore(item.conversation);
        treeProvider.refresh();
      }
    )
  );

  // Command: Toggle done status
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.toggleDone',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        await manager.toggleDone(item.conversation);
        treeProvider.refresh();
      }
    )
  );

  // Command: Export to markdown
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.exportToMarkdown',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        await manager.exportToMarkdown(item.conversation);
      }
    )
  );

  // Command: Delete conversation
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.deleteConversation',
      async (item: ConversationTreeItem) => {
        if (!(item instanceof ConversationTreeItem)) {
          return;
        }

        await manager.delete(item.conversation);
        treeProvider.refresh();
      }
    )
  );

  // Command: Show Claude Chats menu (status bar quick actions)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.showClaudeChatsMenu',
      async () => {
        // Detect or select the conversation
        const conversation = await manager.detectOrSelectConversation();
        if (!conversation) {
          return; // User cancelled or no conversations
        }

        // Build menu items based on conversation state
        const isDone = conversation.title.startsWith('✓');
        const isArchived = conversation.isArchived;

        const menuItems: vscode.QuickPickItem[] = [
          {
            label: '$(edit) Rename',
            detail: 'Change conversation title'
          },
          {
            label: isDone ? '$(circle-outline) Mark as Undone' : '$(check) Mark as Done',
            detail: isDone ? 'Remove done checkmark' : 'Add done checkmark to title'
          },
          {
            label: isArchived ? '$(archive) Restore' : '$(archive) Archive',
            detail: isArchived ? 'Restore from archive' : 'Move to archive'
          },
          {
            label: '',
            kind: vscode.QuickPickItemKind.Separator
          },
          {
            label: '$(export) Export to Markdown',
            detail: 'Save conversation as .md file'
          },
          {
            label: '$(trash) Delete',
            detail: 'Permanently delete conversation'
          }
        ];

        const selected = await vscode.window.showQuickPick(menuItems, {
          placeHolder: `Actions for: ${conversation.title}`
        });

        if (!selected) {
          return; // User cancelled
        }

        // Execute the selected action
        if (selected.label.includes('Rename')) {
          // Rename action
          const newTitle = await vscode.window.showInputBox({
            prompt: 'Enter new conversation title',
            value: conversation.title,
            validateInput: (value) => {
              return value.trim() ? null : 'Title cannot be empty';
            }
          });

          if (newTitle) {
            await manager.rename(conversation, newTitle);
            await treeProvider.updateSingleConversation(conversation.filePath);
            vscode.window.showInformationMessage('Conversation renamed. Close and reopen chat tab to see updated title.');
          }
        } else if (selected.label.includes('Done') || selected.label.includes('Undone')) {
          // Toggle done action
          await manager.toggleDone(conversation);
          await treeProvider.updateSingleConversation(conversation.filePath);
        } else if (selected.label.includes('Archive') || selected.label.includes('Restore')) {
          // Archive/Restore action
          if (isArchived) {
            await manager.restore(conversation);
          } else {
            await manager.archive(conversation);
          }
          treeProvider.refresh();
        } else if (selected.label.includes('Export')) {
          // Export action
          await manager.exportToMarkdown(conversation);
        } else if (selected.label.includes('Delete')) {
          // Delete action
          await manager.delete(conversation);
          treeProvider.refresh();
        }
      }
    )
  );

  // Status bar button for Claude Chats menu (shows only when Claude Code chat is active)
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'claudeCodeConversationManager.showClaudeChatsMenu';
  statusBarItem.text = '$(comment-discussion) Claude Chats';
  statusBarItem.tooltip = 'Quick actions for Claude Code conversation';

  // Function to update status bar button visibility
  function updateStatusBarVisibility() {
    const config = vscode.workspace.getConfiguration('claudeChats');
    const showButton = config.get<boolean>('showStatusBarButton', true);

    if (!showButton) {
      statusBarItem.hide();
      return;
    }

    const claudeTab = getActiveClaudeCodeChatTab();
    if (claudeTab) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  }

  // Update on tab changes
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => {
      updateStatusBarVisibility();
    })
  );

  // Update on configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeChats.showStatusBarButton')) {
        updateStatusBarVisibility();
      }
    })
  );

  // Initial update
  updateStatusBarVisibility();

  context.subscriptions.push(statusBarItem);

  // Watch for Claude Code conversation file changes with intelligent auto-update
  // Only watch the current project directory to avoid unnecessary refreshes
  const path = require('path');
  const os = require('os');
  const claudeProjectsPath = path.join(os.homedir(), '.claude', 'projects');

  // Get current project directory
  const { FileOperations } = require('./fileOperations');
  const currentProject = FileOperations.getCurrentProjectName();

  // Watch only current project's .jsonl files (not all projects)
  const currentProjectPath = currentProject ? path.join(claudeProjectsPath, currentProject) : claudeProjectsPath;
  const watchPattern = new vscode.RelativePattern(currentProjectPath, '*.jsonl');
  const watcher = vscode.workspace.createFileSystemWatcher(watchPattern);

  // Debounce map to handle rapid file writes
  const debounceTimers = new Map<string, NodeJS.Timeout>();
  const createDebounceTimers = new Map<string, NodeJS.Timeout>();
  const DEBOUNCE_DELAY = 500; // 500ms

  // Handle file creation (new conversations) with debouncing
  watcher.onDidCreate((uri) => {
    // Skip backup files
    if (uri.fsPath.endsWith('.backup')) {
      return;
    }

    // Skip refresh if tree is currently loading - avoid interrupting the initial load
    if (treeProvider.isCurrentlyLoading()) {
      log('FileWatcher', `Ignoring file creation during load: ${uri.fsPath}`);
      return;
    }

    // Clear existing timer for this file
    const existingTimer = createDebounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(async () => {
      createDebounceTimers.delete(uri.fsPath);

      // Check if this is a warmup-only conversation before refreshing
      const { FileOperations } = require('./fileOperations');
      const hasRealMessages = await FileOperations.hasRealMessagesAsync(uri.fsPath);

      if (!hasRealMessages) {
        log('FileWatcher', `Ignoring warmup-only conversation: ${uri.fsPath}`);
        return;
      }

      log('FileWatcher', `New conversation detected: ${uri.fsPath}`);

      // Invalidate cross-file summary cache for this project
      const path = require('path');
      const projectDir = path.dirname(uri.fsPath);
      FileOperations.invalidateCrossFileSummaryCache(projectDir);

      // Invalidate cache since a new file was added
      treeProvider.refresh(true);
    }, DEBOUNCE_DELAY);

    createDebounceTimers.set(uri.fsPath, timer);
  });

  // Handle file deletion
  watcher.onDidDelete((uri) => {
    // Skip refresh if tree is currently loading
    if (treeProvider.isCurrentlyLoading()) {
      log('FileWatcher', `Ignoring file deletion during load: ${uri.fsPath}`);
      return;
    }

    log('FileWatcher', `Conversation deleted: ${uri.fsPath}`);

    // Clear any pending debounce for this file
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(uri.fsPath);
    }

    // Invalidate cross-file summary cache for this project
    const { FileOperations } = require('./fileOperations');
    const path = require('path');
    const projectDir = path.dirname(uri.fsPath);
    FileOperations.invalidateCrossFileSummaryCache(projectDir);

    // Invalidate cache since a file was deleted
    treeProvider.refresh(true);
  });

  // Handle file changes with debouncing and auto-update
  watcher.onDidChange((uri) => {
    // Skip backup files
    if (uri.fsPath.endsWith('.backup')) {
      return;
    }

    // Skip refresh if tree is currently loading
    if (treeProvider.isCurrentlyLoading()) {
      log('FileWatcher', `Ignoring file change during load: ${uri.fsPath}`);
      return;
    }

    // Clear existing timer for this file
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(async () => {
      debounceTimers.delete(uri.fsPath);

      // Check if this is a warmup-only conversation before refreshing
      const { FileOperations } = require('./fileOperations');
      const hasRealMessages = await FileOperations.hasRealMessagesAsync(uri.fsPath);

      if (!hasRealMessages) {
        log('FileWatcher', `Ignoring warmup-only conversation update: ${uri.fsPath}`);
        return;
      }

      log('FileWatcher', `Conversation modified: ${uri.fsPath}`);

      // Invalidate message cache for this file (it was modified)
      messageCache.invalidate(uri.fsPath);

      // Check for stale leafUuid and auto-update (silent - no notification needed)
      const wasUpdated = FileOperations.autoUpdateStaleLeafUuid(uri.fsPath);

      if (wasUpdated) {
        log('FileWatcher', `Auto-updated stale leafUuid for: ${uri.fsPath}`);
        // No notification - leafUuid update is internal maintenance, title didn't change

        // Invalidate cross-file cache since leafUuid might have changed
        const path = require('path');
        const projectDir = path.dirname(uri.fsPath);
        FileOperations.invalidateCrossFileSummaryCache(projectDir);
      }

      // Use targeted refresh - only updates this specific conversation in cache
      // Much faster than reloading all 220+ conversations
      await treeProvider.updateSingleConversation(uri.fsPath);
    }, DEBOUNCE_DELAY);

    debounceTimers.set(uri.fsPath, timer);
  });

  // Listen for workspace folder changes to update file watcher
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // Dispose old watcher
      watcher.dispose();

      // Create new watcher for the new project
      const newProject = FileOperations.getCurrentProjectName();
      const newProjectPath = newProject ? path.join(claudeProjectsPath, newProject) : claudeProjectsPath;
      const newWatchPattern = new vscode.RelativePattern(newProjectPath, '*.jsonl');
      const newWatcher = vscode.workspace.createFileSystemWatcher(newWatchPattern);

      // Re-register all event handlers on the new watcher
      // Note: This is simplified - in production you'd want to refactor the handlers into reusable functions
      log('FileWatcher', `Workspace changed, now watching: ${newProjectPath}`);

      // Refresh tree to show new project's conversations
      treeProvider.refresh(true);

      context.subscriptions.push(newWatcher);
    })
  );

  // Clean up timers on deactivation
  context.subscriptions.push({
    dispose: () => {
      debounceTimers.forEach(timer => clearTimeout(timer));
      debounceTimers.clear();
      createDebounceTimers.forEach(timer => clearTimeout(timer));
      createDebounceTimers.clear();
    }
  });

  context.subscriptions.push(watcher);
}

export function deactivate() {}
