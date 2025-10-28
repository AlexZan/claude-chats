import * as vscode from 'vscode';
import { ConversationTreeProvider, ConversationTreeItem } from './conversationTree';
import { ConversationManager } from './conversationManager';
import { ConversationViewer } from './conversationViewer';

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
      treeProvider.refresh();
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
        treeProvider.refresh();
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
        treeProvider.refresh();
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
  const claudeProjectsPath = require('path').join(require('os').homedir(), '.claude', 'projects');
  const watchPattern = new vscode.RelativePattern(claudeProjectsPath, '**/*.jsonl');
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
      console.log(`[FileWatcher] Ignoring file creation during load: ${uri.fsPath}`);
      return;
    }

    // Clear existing timer for this file
    const existingTimer = createDebounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      createDebounceTimers.delete(uri.fsPath);
      console.log(`[FileWatcher] New conversation detected: ${uri.fsPath}`);
      treeProvider.refresh();
    }, DEBOUNCE_DELAY);

    createDebounceTimers.set(uri.fsPath, timer);
  });

  // Handle file deletion
  watcher.onDidDelete((uri) => {
    // Skip refresh if tree is currently loading
    if (treeProvider.isCurrentlyLoading()) {
      console.log(`[FileWatcher] Ignoring file deletion during load: ${uri.fsPath}`);
      return;
    }

    console.log(`[FileWatcher] Conversation deleted: ${uri.fsPath}`);

    // Clear any pending debounce for this file
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(uri.fsPath);
    }

    treeProvider.refresh();
  });

  // Handle file changes with debouncing and auto-update
  watcher.onDidChange((uri) => {
    // Skip backup files
    if (uri.fsPath.endsWith('.backup')) {
      return;
    }

    // Skip refresh if tree is currently loading
    if (treeProvider.isCurrentlyLoading()) {
      console.log(`[FileWatcher] Ignoring file change during load: ${uri.fsPath}`);
      return;
    }

    // Clear existing timer for this file
    const existingTimer = debounceTimers.get(uri.fsPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      debounceTimers.delete(uri.fsPath);

      console.log(`[FileWatcher] Conversation modified: ${uri.fsPath}`);

      // Check for stale leafUuid and auto-update
      const { FileOperations } = require('./fileOperations');
      const wasUpdated = FileOperations.autoUpdateStaleLeafUuid(uri.fsPath);

      if (wasUpdated) {
        console.log(`[FileWatcher] Auto-updated stale leafUuid for: ${uri.fsPath}`);
        vscode.window.showInformationMessage('Conversation title updated automatically');
      }

      // Refresh tree view to show any changes
      treeProvider.refresh();
    }, DEBOUNCE_DELAY);

    debounceTimers.set(uri.fsPath, timer);
  });

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
