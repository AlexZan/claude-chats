# Claude Chats

A VS Code extension for managing Claude Code conversations. Rename conversations, organize with archives, and search through your conversation history.

![Claude Chats Extension](demo-rename.gif)

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AlexZanfir.claude-chats)
2. Click the "Claude Conversations" icon in the Activity Bar

## Features

**Rename Conversations** - This extension modifies Claude Code's `.jsonl` files to change conversation titles. Changes persist in Claude Code's native interface. Automatic backups are created before any modifications.

**Quick Access** - A status bar button appears when a Claude Code chat is active. One-click access to rename, mark as done, archive, export, or delete. Also available via right-click on editor tabs.

**Organization** - Browse conversations in a tree view, grouped by project or date. Archive old conversations and search through conversation history with full-text search.

**Conversation Viewer** - Opens conversations in a custom viewer with message bubbles and syntax highlighting. Claude Code doesn't currently provide a way to open past conversations programmatically, so this extension includes its own viewer.

**Performance** - Loads 200+ conversations in under 2 seconds by reading only the first 10 lines of each file.

## Usage

**Rename:** Right-click a conversation in the tree view, or use the status bar button when a chat is active, or use the command palette (`Ctrl+Shift+P` → "Rename Current Conversation").

**Archive:** Click the 📦 icon in the tree view or right-click and select "Archive". Restore from the "Archived Conversations" section.

**Search:** Click the search icon in the tree view toolbar.

**Note:** After renaming, close and reopen the Claude Code chat tab to see the updated title (Claude Code caches tab names).

## Settings

- `claudeChats.groupBy` - Group by `project` or `date` (default: `project`)
- `claudeChats.showArchivedInTree` - Display archived conversations (default: `true`)
- `claudeChats.showEmptyConversations` - Show warmup-only conversations (default: `false`)
- `claudeChats.showStatusBarButton` - Show quick menu when chat is active (default: `true`)
- `claudeChats.enableDebugLogs` - Write debug logs to file for troubleshooting (default: `false`)
- `claudeChats.createBackups` - Create `.backup` files before modifications (default: `true`)

## How It Works

This extension modifies Claude Code's `.jsonl` conversation files using the same summary mechanism that Claude Code uses internally. It adds or updates the summary message and updates the `leafUuid` to reference the conversation's final message. A file watcher automatically updates the `leafUuid` when you continue an active conversation.

This is an unofficial workaround until Anthropic adds native rename support to Claude Code.

## Requirements

- VS Code 1.95.0 or higher
- Claude Code extension installed

## Support

Report issues on [GitHub](https://github.com/AlexZan/claude-chats/issues).

## Disclaimer

This extension modifies Claude Code conversation files. While automatic backups are created, you are responsible for your data. This is an unofficial tool and is not affiliated with Anthropic.

## License

[MIT](LICENSE)
