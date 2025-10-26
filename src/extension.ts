import * as vscode from 'vscode';
import { ConversationTreeProvider, ConversationTreeItem } from './conversationTree';
import { ConversationManager } from './conversationManager';

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

        const markDone = await vscode.window.showQuickPick(
          [
            { label: 'Archive', description: 'Archive without marking done', value: false },
            { label: 'Archive and mark done', description: 'Add ✓ prefix before archiving', value: true }
          ],
          { placeHolder: 'How would you like to archive this conversation?' }
        );

        if (markDone === undefined) {
          return;
        }

        await manager.archive(item.conversation, markDone.value);
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

        const markDone = await vscode.window.showQuickPick(
          [
            { label: 'Archive', description: 'Archive without marking done', value: false },
            { label: 'Archive and mark done', description: 'Add ✓ prefix before archiving', value: true }
          ],
          { placeHolder: 'How would you like to archive this conversation?' }
        );

        if (markDone === undefined) {
          return;
        }

        await manager.archive(conversation, markDone.value);
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

  // Watch for file system changes to refresh tree
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.jsonl');

  watcher.onDidCreate(() => treeProvider.refresh());
  watcher.onDidDelete(() => treeProvider.refresh());
  watcher.onDidChange(() => treeProvider.refresh());

  context.subscriptions.push(watcher);
}

export function deactivate() {}
