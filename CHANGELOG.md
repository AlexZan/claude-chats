# Change Log

All notable changes to the "Claude Chats" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-10-26

### Added
- Initial release of Claude Chats
- **Conversation Tree View**
  - Browse all Claude Code conversations in a dedicated sidebar
  - Group conversations by project or date
  - Show/hide archived conversations
  - Filter empty conversations (warmup/sidechain only)
- **Rename Conversations**
  - Rename from tree view context menu
  - Rename current conversation from command palette
  - Smart validation to prevent naming conflicts
  - Preserves conversation metadata
- **Archive & Restore**
  - Archive conversations to keep workspace clean
  - Configurable archive location
  - Optional confirmation dialogs
  - Restore archived conversations
  - View archived conversations in tree
- **Delete Conversations**
  - Permanently delete unwanted conversations
  - Confirmation dialog for safety
- **Safety Features**
  - Automatic backups before modifications
  - JSON validation before writing
  - Non-destructive operations
  - Graceful error handling
- **Configuration Options**
  - `claudeChats.archiveLocation` - Custom archive location
  - `claudeChats.createBackups` - Toggle automatic backups
  - `claudeChats.confirmArchive` - Toggle confirmation dialogs
  - `claudeChats.showArchivedInTree` - Show/hide archived conversations
  - `claudeChats.groupBy` - Group by project or date
  - `claudeChats.showEmptyConversations` - Show/hide empty conversations
- **Commands**
  - `Claude Code: Rename Current Conversation`
  - `Claude Code: Archive Current Conversation`
  - `Claude Code: Show Conversation Manager`
  - `Claude Code: Refresh Conversations`

### Fixed
- N/A (initial release)

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Security
- N/A (initial release)

---

## Release Notes Template for Future Versions

## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Fixed
- Bug fixes

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Now removed features

### Security
- Security improvements/fixes
