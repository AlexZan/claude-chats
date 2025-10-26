# Claude Chats

**Organize, rename, and archive your Claude Code conversations**

Never lose track of your AI conversations again. Claude Chats brings powerful conversation management directly into VS Code, helping you stay organized as you work with Claude Code.

## ⚠️ Legal Disclaimer

**USE AT YOUR OWN RISK**

This extension directly modifies Claude Code conversation files (`.jsonl` format). While we take precautions:

- ✅ **Automatic backups** are created before any modification (`.jsonl.backup` files)
- ✅ Backups can be disabled in settings if desired
- ⚠️ **This is a hacky solution** - we're directly editing conversation files
- ⚠️ We try our best to stay compatible with Claude Code's format
- ⚠️ **No guarantees** if Anthropic makes breaking changes to the file format
- ⚠️ The extension may stop working after Claude Code updates

**Why this approach?**
This extension provides rename and management capabilities that Claude Code doesn't officially support yet. It's a workaround until Anthropic decides to add these features officially.

**Recommendations:**
- Keep backups enabled (default)
- Don't modify conversations that are currently open
- Test on non-critical conversations first
- Keep your `.jsonl.backup` files safe

By using this extension, you accept that you are responsible for any data loss or corruption that may occur.

## Features

### 🗂️ Conversation Organization
- **Tree View** - Browse all your Claude Code conversations in a dedicated sidebar
- **Group by Project or Date** - Organize conversations the way you work
- **Search & Filter** - Quickly find the conversation you need

### ✏️ Rename Conversations
- Give your conversations meaningful names
- Rename directly from the tree view or command palette
- Smart validation prevents naming conflicts

### 📦 Archive & Restore
- Archive old conversations to keep your workspace clean
- Restore archived conversations when you need them
- Configurable archive location
- Optional confirmation dialogs for safety

### 🛡️ Safe & Reliable
- Automatic backups before any modifications
- Non-destructive operations
- Works with existing Claude Code conversation structure

### ⚡ Quick Access
- **Command Palette** - Access all features via `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- **Context Menus** - Right-click conversations for quick actions
- **Inline Actions** - Rename and archive with one click

## Why Claude Chats?

Working with Claude Code generates many conversations. Over time, it becomes hard to:
- Find that conversation where you solved a specific problem
- Keep track of which projects have active discussions
- Clean up old or completed conversations

Claude Chats solves this by providing a VS Code-native way to organize and manage all your Claude Code conversations.

## Installation

### From Source (Development)

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch Extension Development Host

### From Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`)
3. Search for "Claude Chats"
4. Click Install

Or install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.claude-chats)

## Usage

### View Conversations

1. Click the "Claude Conversations" icon in the Activity Bar
2. Browse conversations grouped by project
3. Expand "Active Conversations" or "Archived Conversations"

### Rename a Conversation

**From Tree View:**
1. Right-click a conversation
2. Select "Rename"
3. Enter new title

**From Command Palette:**
1. Open a `.jsonl` conversation file
2. Press `Ctrl+Shift+P`
3. Run "Claude Code: Rename Current Conversation"

### Mark as Done/Undone

**From Tree View (Quick):**
1. Click the ✓ Toggle Done icon button on any conversation
2. Adds or removes ✓ prefix to track completed conversations

**From Tree View (Right-click):**
1. Right-click a conversation
2. Select "Toggle Done"

This marks conversations as complete without archiving them, useful for keeping finished chats accessible.

### Archive a Conversation

**From Tree View (Quick):**
1. Click the 📦 Archive icon button on any conversation
2. Confirm archive

**From Tree View (Right-click):**
1. Right-click a conversation
2. Select "Archive"
3. Confirm archive

**From Command Palette:**
1. Open a `.jsonl` conversation file
2. Press `Ctrl+Shift+P`
3. Run "Claude Code: Archive Current Conversation"

### Restore from Archive

1. Expand "Archived Conversations" in tree view
2. Right-click an archived conversation
3. Select "Restore"

### Delete a Conversation

1. Right-click a conversation
2. Select "Delete"
3. Confirm deletion (cannot be undone)

## Extension Settings

This extension contributes the following settings:

* `claudeChats.archiveLocation` - Location for archived conversations (default: `~/.claude/projects/_archive`)
* `claudeChats.createBackups` - Create backup files before modifying conversations (default: `true`)
* `claudeChats.confirmArchive` - Show confirmation dialog before archiving (default: `true`)
* `claudeChats.showArchivedInTree` - Show archived conversations in the tree view (default: `true`)
* `claudeChats.groupBy` - How to group conversations: `project` or `date` (default: `project`)
* `claudeChats.showEmptyConversations` - Show conversations with no actual user content (default: `false`)

## Commands

* `Claude Code: Rename Current Conversation` - Rename the currently active conversation
* `Claude Code: Archive Current Conversation` - Archive the currently active conversation
* `Claude Code: Show Conversation Manager` - Open the conversation tree view
* `Claude Code: Refresh Conversations` - Refresh the conversation list

## Requirements

- VS Code 1.95.0 or higher
- Claude Code extension installed

## How It Works

### Rename Implementation

- Modifies the first user message directly in the `.jsonl` file
- No orphaned messages or `parentUuid: null` tricks
- Creates backup before modification
- Updates VS Code's conversation cache automatically

### Archive Implementation

- Moves `.jsonl` file to `~/.claude/projects/_archive/[project-name]/`
- Optionally adds ✓ prefix to mark as done
- Only allows archiving if conversation is not currently open
- VS Code no longer shows it in conversation list

### File Safety

- Always creates `.backup` files before modification
- Validates JSON structure before writing
- Handles file locks gracefully
- Atomic operations where possible

## Known Issues

See [GitHub Issues](https://github.com/yourusername/claude-chats/issues) for current known issues.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### 0.1.0

Initial release of Claude Chats:
- Conversation tree view with project/date grouping
- Rename conversations with validation
- Archive and restore functionality
- Delete conversations
- Configurable settings
- Automatic backups

## Troubleshooting

### Conversation still appears after archiving

- Make sure the conversation is not open in any VS Code window
- Try refreshing the tree view (click refresh icon)
- Reload VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window")

### "No conversations found"

- Check that Claude Code extension is installed
- Verify conversations exist in `~/.claude/projects/[project-name]/`
- Check file permissions

## Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/yourusername/claude-chats/issues).

## License

[MIT](LICENSE)

---

**Enjoy using Claude Chats!** If you find this extension helpful, please consider leaving a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.claude-chats).
