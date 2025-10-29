import * as vscode from 'vscode';
import { ConversationTreeProvider, ConversationTreeItem } from './conversationTree';
import { ConversationManager } from './conversationManager';
import { ConversationViewer } from './conversationViewer';

/**
 * Get formatted timestamp for logs
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code Conversation Manager activated');

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

  // Command: Rename current conversation (from command palette)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudeCodeConversationManager.renameCurrentConversation',
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
      console.log(`[${getTimestamp()}] [FileWatcher] Ignoring file creation during load: ${uri.fsPath}`);
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
        console.log(`[${getTimestamp()}] [FileWatcher] Ignoring warmup-only conversation: ${uri.fsPath}`);
        return;
      }

      console.log(`[${getTimestamp()}] [FileWatcher] New conversation detected: ${uri.fsPath}`);
      // Invalidate cache since a new file was added
      treeProvider.refresh(true);
    }, DEBOUNCE_DELAY);

    createDebounceTimers.set(uri.fsPath, timer);
  });

  // Handle file deletion
  watcher.onDidDelete((uri) => {
    // Skip refresh if tree is currently loading
    if (treeProvider.isCurrentlyLoading()) {
      console.log(`[${getTimestamp()}] [FileWatcher] Ignoring file deletion during load: ${uri.fsPath}`);
      return;
    }

    console.log(`[${getTimestamp()}] [FileWatcher] Conversation deleted: ${uri.fsPath}`);

    // Clear any pending debounce for this file
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(uri.fsPath);
    }

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
      console.log(`[${getTimestamp()}] [FileWatcher] Ignoring file change during load: ${uri.fsPath}`);
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
        console.log(`[${getTimestamp()}] [FileWatcher] Ignoring warmup-only conversation update: ${uri.fsPath}`);
        return;
      }

      console.log(`[${getTimestamp()}] [FileWatcher] Conversation modified: ${uri.fsPath}`);

      // Check for stale leafUuid and auto-update
      const wasUpdated = FileOperations.autoUpdateStaleLeafUuid(uri.fsPath);

      if (wasUpdated) {
        console.log(`[${getTimestamp()}] [FileWatcher] Auto-updated stale leafUuid for: ${uri.fsPath}`);
        vscode.window.showInformationMessage('Conversation title updated automatically');
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
      console.log(`[${getTimestamp()}] [FileWatcher] Workspace changed, now watching: ${newProjectPath}`);

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
