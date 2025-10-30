# Claude Chats - VS Code Extension

## Project Overview

A VS Code extension for managing Claude Code conversations, providing renaming, archiving, and organization capabilities outside of the conversation context.

> **🎉 Major Discovery (October 2025):** Conversations can be renamed using summary messages! This provides a cleaner, safer method than modifying conversation content. See [Section 7 in FINDINGS.md](FINDINGS.md#7-summary-based-conversation-renaming) for technical details.

## The Problem

### Current State: Broken In-Conversation Management

The current approach of managing conversations from **inside** the conversation itself is fundamentally flawed:

#### Issue #1: Archive Function Creates Ghost Files
**What happens:**
1. User runs `/archive` slash command from inside an active conversation
2. Archive script moves the `.jsonl` file to `~/.claude/projects/_archive/`
3. Claude responds "Successfully archived!"
4. **VS Code saves this response to the original file location** (recreating the file!)
5. Result: Conversation appears in both active list AND archive

**Root cause:** VS Code Claude Code extension continues writing to the conversation file AFTER it's been moved, which recreates the file in the original location.

**Evidence:**
```
File: d--Dev-AgentRoundTableCLI/327c2b66-ac2b-44e7-9154-ca67ab62b976.jsonl
- Before archive: 18 lines, 15,210 bytes
- After archive: 4 lines, 5,318 bytes (NEW FILE created by VS Code)
- Archive folder: Contains original 18-line file
- User sees: Conversation still in active list (pointing to new 4-line file)
```

#### Issue #2: Rename Function Creates "No prompt" Ghost Conversations
**What happens:**
1. User runs `/rename` slash command with a new title
2. Rename script inserts an "orphaned" message with:
   - `parentUuid: null` (not part of conversation chain)
   - `isSidechain: false` (so VS Code uses it as title)
3. **VS Code interprets this as a NEW conversation**
4. Result: Multiple "No prompt" entries appear in conversation list

**Root cause:** The rename approach of inserting orphaned messages confuses VS Code's conversation detection logic.

**Evidence from user:**
- Multiple conversations titled "No prompt" appeared after using rename
- Conversations disappeared from list that user didn't want removed
- Cannot reliably identify which conversations are real vs. artifacts

#### Issue #3: Unreliable "Current Session" Detection
**What happens:**
1. Scripts use "most recently modified file" to detect current session
2. Multiple conversations may be open simultaneously
3. Background processes can modify file timestamps
4. Result: Wrong conversation gets renamed/archived

**Root cause:** File modification time is not a reliable indicator of which conversation is "current" in VS Code.

### Why In-Conversation Management Doesn't Work

**Timing Race Conditions:**
- Archive moves file → VS Code writes response → File recreated
- Rename modifies file → VS Code reloads → Confusion about conversation identity

**State Inconsistency:**
- Conversation file state changes while conversation is active
- VS Code cache vs. disk state mismatch
- No way to "commit" changes atomically

**Architectural Mismatch:**
- VS Code manages conversation lifecycle
- Scripts operate outside VS Code's knowledge
- No coordination between the two

## The Solution: VS Code Extension

### Why This Works

**Outside Conversation Context:**
- Operates at VS Code extension level, not inside conversation
- No race conditions with active conversations
- Can safely manipulate files using VS Code APIs

**Proper Integration:**
- Uses VS Code's file system APIs
- Respects VS Code's conversation lifecycle
- Can trigger VS Code UI updates correctly

**Better UX:**
- Dedicated UI for browsing conversations
- Visual feedback (tree view, quick pick menus)
- Keyboard shortcuts for common actions

### Core Features

#### 1. Conversation List View (Tree View)

**Location:** VS Code sidebar panel

**Features:**
- Show all conversations grouped by project
- Display conversation title (first user message)
- Show timestamp, message count, file size
- Icons for different states (active, archived, bookmarked)

**Actions (Right-click context menu):**
- Rename conversation
- Archive conversation
- Delete conversation
- Duplicate conversation
- Export conversation

#### 2. Rename Conversations

**How it works:**
- Select conversation from tree view OR use command palette on active conversation
- Show input box with current title pre-filled
- Modify the first user message directly (not orphaned messages)
- Update VS Code's conversation cache

**Implementation:**
```typescript
// Modify first user message in .jsonl file
// Find: {type: "user", isSidechain: false, ...}
// Update: message.content field
// No orphaned messages, no parent UUID tricks
```

#### 3. Archive Conversations

**How it works:**
- Select conversation(s) from tree view
- Move to `~/.claude/projects/_archive/[project-name]/`
- Option to mark as done (✓ prefix) before archiving
- Refresh VS Code's conversation list

**Archive folder structure:**
```
~/.claude/projects/
  _archive/
    d--Dev-ProjectA/
      conversation-1.jsonl
      conversation-2.jsonl
    d--Dev-ProjectB/
      conversation-3.jsonl
```

**Important:** Only allow archiving conversations that are NOT currently open

#### 4. Restore Archived Conversations

**How it works:**
- Browse archived conversations in tree view (separate "Archive" section)
- Select and restore back to active project folder
- Refresh VS Code's conversation list

#### 5. Bulk Operations

**Features:**
- Select multiple conversations (Ctrl+Click)
- Bulk archive, delete, or tag
- Filter conversations by:
  - Project
  - Date range
  - Title/content search
  - Tags/metadata

### Technical Architecture

#### File Structure
```
claude-code-conversation-manager/
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── conversationTree.ts   # Tree view provider
│   ├── conversationManager.ts # Core business logic
│   ├── fileOperations.ts     # Safe file operations
│   └── types.ts              # TypeScript types
├── resources/
│   └── icons/                # Custom icons
└── README.md
```

#### Key Components

**1. Conversation Tree Provider**
```typescript
class ConversationTreeProvider implements vscode.TreeDataProvider<ConversationItem> {
  // Provides tree view of conversations
  // Grouped by: Active, Archived, Deleted (trash)
  // Shows metadata: title, date, size, project
}
```

**2. Conversation Manager**
```typescript
class ConversationManager {
  // Core operations:
  rename(conversationId: string, newTitle: string): Promise<void>
  archive(conversationId: string, markDone?: boolean): Promise<void>
  restore(conversationId: string): Promise<void>
  delete(conversationId: string, permanent?: boolean): Promise<void>

  // Safe file operations:
  // - Create backup before modification
  // - Validate .jsonl structure
  // - Handle file locks gracefully
  // - Update VS Code cache
}
```

**3. File Operations Helper**
```typescript
class FileOperations {
  // Parse .jsonl conversation files
  parseConversation(file: string): Conversation
  getFirstUserMessage(conversation: Conversation): Message

  // Summary-based renaming (RECOMMENDED - discovered Oct 2025)
  updateSummary(file: string, newTitle: string): void
  addSummary(file: string, newTitle: string, leafUuid: string): void
  getSummaryMessages(file: string): SummaryMessage[]

  // Legacy: First user message modification (fallback only)
  updateFirstUserMessage(file: string, newContent: string): void

  // Safe move operations
  moveToArchive(file: string, project: string): void
  moveToTrash(file: string): void
  restoreFromArchive(file: string, project: string): void
}
```

### Data Structures

**Conversation File Format** (`.jsonl`)
```jsonl
{"type":"summary","summary":"Conversation Title","leafUuid":"uuid-of-last-message"}
{"type":"user","isSidechain":false,"message":{"role":"user","content":"First message"},...}
{"type":"assistant","message":{"role":"assistant","content":"..."},...}
{"type":"user","message":{"role":"user","content":"..."},...}
```

**Note:** Summary messages are optional but recommended for custom titles. Claude Code uses them for conversation display. See [FINDINGS.md](FINDINGS.md#7-summary-based-conversation-renaming) for details.

**Metadata** (optional: `.claude/conversations.json`)
```json
{
  "conversations": {
    "conversation-id-1": {
      "title": "Custom Title",
      "tags": ["important", "work"],
      "archived": false,
      "bookmarked": true,
      "lastModified": "2025-10-26T12:00:00Z"
    }
  }
}
```

### User Experience

#### Rename Flow
1. User right-clicks conversation in tree view
2. Selects "Rename Conversation"
3. Input box appears with current title
4. User types new title, presses Enter
5. Extension updates conversation title using **summary-based approach**:
   - If summary exists: Modify existing `summary` field
   - If no summary: Add new summary message at beginning of file
   - leafUuid points to last non-sidechain message UUID
6. Tree view refreshes to show new title (immediate, no reload needed)
7. If conversation is open, VS Code updates tab title

**Technical Note:** Summary-based renaming (discovered Oct 2025) is the preferred method as it:
- Doesn't modify conversation content
- Persists reliably (Claude Code doesn't overwrite)
- Works whether summary exists or not
- See [FINDINGS.md](FINDINGS.md#7-summary-based-conversation-renaming)

#### Archive Flow
1. User right-clicks conversation in tree view
2. Selects "Archive Conversation"
3. Optional: Checkbox "Mark as done (✓)"
4. Confirmation dialog (if conversation is large/important)
5. Extension moves file to archive folder
6. Tree view moves item to "Archived" section
7. Success notification

#### Restore Flow
1. User expands "Archived" section in tree view
2. Right-clicks archived conversation
3. Selects "Restore Conversation"
4. Extension moves file back to project folder
5. Tree view moves item to "Active" section
6. Success notification

### Commands (Command Palette)

- `Claude Code: Rename Current Conversation`
- `Claude Code: Archive Current Conversation`
- `Claude Code: Show Conversation Manager`
- `Claude Code: Search Conversations`
- `Claude Code: Export Conversation to Markdown`
- `Claude Code: Restore from Archive`

### Settings

```json
{
  "claudeCodeConversationManager.archiveLocation": "~/.claude/projects/_archive",
  "claudeCodeConversationManager.createBackups": true,
  "claudeCodeConversationManager.confirmArchive": true,
  "claudeCodeConversationManager.showArchivedInTree": true,
  "claudeCodeConversationManager.groupBy": "project" // or "date"
}
```

## Technical Requirements

### Dependencies
- VS Code Extension API (^1.95.0)
- TypeScript (^5.0.0)
- No external npm packages for core functionality (use Node.js built-ins)

### Compatibility
- VS Code: 1.95.0+
- Claude Code Extension: Latest version
- OS: Windows, macOS, Linux

### File Safety
- Always create `.backup` files before modification
- Validate JSON structure before writing
- Handle file locks gracefully (Windows)
- Atomic operations where possible

### Error Handling
- Graceful degradation if file is locked
- Clear error messages to user
- Rollback on failure (restore from backup)
- Log errors for debugging

## Implementation Phases

### Phase 1: Core Infrastructure (MVP) ✅ COMPLETED
- [x] Project setup (package.json, tsconfig.json)
- [x] TypeScript types and interfaces (types.ts)
- [x] Basic tree view of active conversations
- [x] Tree view with project grouping
- [x] Rename conversation (summary-based approach - Oct 2025 discovery)
- [x] Archive conversation (move to _archive folder)
- [x] Command palette integration
- [x] Context menu actions (right-click)
- [x] File system watcher for auto-refresh
- [x] Backup creation before modifications
- [x] Safe file operations with error handling

### Phase 2: Archive Management ✅ COMPLETED
- [x] Show archived conversations in tree view
- [x] Restore from archive
- [x] Delete conversations with confirmation
- [x] Mark as done (✓ prefix) when archiving
- [x] Group archived conversations by project
- [ ] Search archived conversations
- [ ] Bulk operations (multi-select)

### Phase 3: Enhanced Features
- [ ] Tags and metadata
- [ ] Export to Markdown
- [ ] Conversation templates
- [ ] Statistics (message count, token usage)
- [ ] Conversation search (full-text)
- [ ] Filter by date range
- [ ] Sort options (date, title, size)
- [ ] Duplicate conversation

### Phase 4: Polish
- [x] Built-in VS Code icons (comment-discussion, archive, etc.)
- [ ] Custom SVG icons for better visual identity
- [ ] Keyboard shortcuts configuration
- [ ] Settings UI page
- [ ] Marketplace publication
- [ ] Extension icon and banner
- [ ] Screenshots and demo GIFs
- [ ] Comprehensive testing suite

## Success Criteria

**Must Have:**
- Rename conversations without creating "No prompt" ghosts
- Archive conversations that actually disappear from active list
- Restore archived conversations reliably
- No data loss (always create backups)

**Nice to Have:**
- Fast performance (handle 100+ conversations)
- Beautiful UI (custom icons, smooth animations)
- Power user features (keyboard shortcuts, bulk ops)

## Known Risks and Mitigations

### Risk #1: VS Code API Changes
**Mitigation:** Use stable VS Code APIs only, monitor VS Code release notes

### Risk #2: Claude Code Extension Updates
**Mitigation:** Design to work with .jsonl files directly, minimal assumptions about Claude Code internals

### Risk #3: File System Race Conditions
**Mitigation:** Use file locks, atomic operations, backup-before-modify pattern

### Risk #4: User Has Conversation Open While Archiving
**Mitigation:** Detect if file is open, warn user, refuse to archive open conversations

## Future Enhancements

- **Cloud Sync:** Sync conversations across devices
- **AI-Powered Search:** Semantic search through conversation content
- **Conversation Analytics:** Visualize token usage, conversation patterns
- **Templates:** Save conversations as templates for reuse
- **Export Formats:** Export to PDF, HTML, JSON
- **Integrations:** GitHub Gists, Notion, Obsidian

## References

### Claude Code File Locations
- Projects: `~/.claude/projects/[project-name]/`
- Archive: `~/.claude/projects/_archive/[project-name]/`
- Skills: `~/.claude/skills/`
- Settings: `.claude/settings.json`

### Conversation File Format
- Extension: `.jsonl` (JSON Lines)
- Each line: JSON object representing one message
- Fields: `type`, `message`, `uuid`, `parentUuid`, `isSidechain`, `timestamp`

### Current Broken Implementation
- Location: `~/.claude/skills/chat-history-manager/`
- Archive script: `scripts/archive_conversation.py`
- Rename script: `scripts/rename_conversation_safe.py`
- Problems: Race conditions, ghost files, unreliable session detection

## Lessons Learned

**From Current Implementation:**
1. Don't manage conversation files from inside the conversation
2. File modification time is unreliable for "current session" detection
3. Orphaned messages with `parentUuid: null` confuse VS Code
4. Moving files while VS Code has them open causes file recreation
5. Need proper integration with VS Code lifecycle

**For New Implementation:**
1. Operate at extension level, not conversation level
2. Use VS Code APIs for file operations
3. Detect if conversation is open before modifying
4. Modify first user message directly (no orphaned messages)
5. Create backups before every modification
6. Test with multiple VS Code windows open

## Development Setup

```bash
# Create project
mkdir claude-code-conversation-manager
cd claude-code-conversation-manager

# Initialize npm
npm init -y

# Install dependencies
npm install --save-dev @types/vscode @types/node typescript

# Initialize TypeScript
npx tsc --init

# Install VS Code extension tools
npm install --save-dev @vscode/vsce

# Run extension in development
code .
# Press F5 to launch Extension Development Host
```

## Testing Strategy

### Unit Tests
- Test conversation parsing
- Test file operations (with mocks)
- Test metadata extraction

### Integration Tests
- Test with real .jsonl files
- Test archive/restore flow
- Test rename flow

### Manual Testing Scenarios
1. Rename conversation while it's open
2. Archive conversation while it's open
3. Archive multiple conversations at once
4. Restore archived conversation
5. Test with very large conversation files (>100MB)
6. Test with corrupted .jsonl files

## License

MIT

## Author

Built to solve the fundamental architectural problems with managing Claude Code conversations from inside the conversation context.
