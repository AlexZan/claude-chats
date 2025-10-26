# Claude Code Conversation Manager

A VS Code extension for managing Claude Code conversations, providing renaming, archiving, and organization capabilities.

## Features

- **Tree View**: Browse all active and archived conversations in a dedicated sidebar
- **Rename Conversations**: Change conversation titles without creating ghost entries
- **Archive Conversations**: Move conversations to archive folder (removes from active list)
- **Restore Conversations**: Bring archived conversations back to active list
- **Delete Conversations**: Permanently remove unwanted conversations
- **Automatic Backup**: Creates backup files before any modification

## Why This Extension?

The previous approach of managing conversations from inside the conversation itself was fundamentally flawed:

- Archive scripts would move files, but VS Code would recreate them when saving responses
- Rename scripts created "orphaned messages" that confused VS Code's conversation detection
- No reliable way to detect which conversation was "current"

This extension solves these problems by operating at the VS Code extension level, outside the conversation context.

## Installation

### From Source (Development)

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch Extension Development Host

### From VSIX (Future)

1. Download the `.vsix` file
2. Run `code --install-extension claude-code-conversation-manager-0.1.0.vsix`

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

### Archive a Conversation

**From Tree View:**
1. Right-click a conversation
2. Select "Archive"
3. Choose whether to mark as done (✓ prefix)

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

## Settings

```json
{
  "claudeCodeConversationManager.archiveLocation": "~/.claude/projects/_archive",
  "claudeCodeConversationManager.createBackups": true,
  "claudeCodeConversationManager.confirmArchive": true,
  "claudeCodeConversationManager.showArchivedInTree": true,
  "claudeCodeConversationManager.groupBy": "project"
}
```

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

## Known Limitations

- Cannot archive conversations that are currently open (by design, prevents race conditions)
- Requires VS Code reload to see some changes in conversation list
- Only works with Claude Code extension's `.jsonl` format

## Troubleshooting

### Conversation still appears after archiving

- Make sure the conversation is not open in any VS Code window
- Try refreshing the tree view (click refresh icon)
- Reload VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window")

### "No conversations found"

- Check that Claude Code extension is installed
- Verify conversations exist in `~/.claude/projects/[project-name]/`
- Check file permissions

## Development

### Build

```bash
npm install
npm run compile
```

### Run in Development

1. Open project in VS Code
2. Press F5 to launch Extension Development Host
3. Test extension in the new window

### Package

```bash
npm install -g @vscode/vsce
vsce package
```

## License

MIT

## Credits

Built to solve the fundamental architectural problems with managing Claude Code conversations from inside the conversation context.

See [SPEC.md](SPEC.md) for detailed specification and problem analysis.
