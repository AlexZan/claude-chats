# Change Log

All notable changes to the "Claude Chats" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.5] - 2025-01-28

### Performance Improvements

This release focuses on major performance optimizations for users with large conversation histories (200+ files).

### Added

- **Timestamped Logging**: All log messages now include millisecond-precision timestamps (HH:MM:SS.mmm format) for better performance debugging
- **Smart Caching System**:
  - Implemented 60-second cache TTL to avoid redundant file operations
  - Cache is preserved during view updates but invalidated on data changes
  - File watchers and user actions intelligently manage cache invalidation

### Fixed

- **Eliminated Double-Parsing Bottleneck**: Fixed critical performance issue where files were being parsed twice
  - First in parallel during load (fast)
  - Then sequentially during filtering (very slow)
  - Solution: Added `hasRealMessages` field to `Conversation` interface to cache warmup detection results
  - **Performance impact**: Reduced filtering overhead from O(n) file reads to O(1) property access
- **Multiple Reloads During Initial Load**: Fixed race condition where file watcher would trigger refreshes during the initial load
  - Added `isLoading` flag to track loading state
  - Added 2-second grace period after load completes to ignore spurious file events
  - File watcher now checks `isCurrentlyLoading()` before processing events
- **Warmup Conversation Spam**: Fixed file watcher continuously refreshing from Claude Code's background warmup conversations
  - File watchers now check `hasRealMessagesAsync()` before triggering refreshes
  - Warmup-only conversations are logged but don't cause tree refreshes
  - Users see "Ignoring warmup-only conversation" in logs instead of constant refreshes
- **Verbose Console Logging**: Reduced log output by ~98%
  - Removed per-file processing logs (was generating 500+ lines for 178 files)
  - Kept only summary messages showing total file count and completion

### Changed

- **Cache Invalidation Strategy**: Made `refresh()` cache invalidation optional via parameter
  - Default behavior: `refresh(true)` invalidates cache (for data-modifying operations)
  - View updates can use `refresh(false)` to preserve cache
  - Manual refresh command explicitly invalidates cache to force fresh data
- **Parallel File Processing**: Optimized `getAllConversationsAsync()` to process files in parallel using `Promise.all()`
- **Async File Operations**: All file I/O now uses async/await to prevent UI blocking

### Technical Details

For users with ~200 conversation files:
- **Before optimizations**: 30-50 seconds per load, multiple reloads, 500+ log lines
- **After optimizations**: ~35-40 seconds for initial load (single pass), <1 second for cached refreshes, minimal logging

The performance improvements come from:
1. Eliminating redundant file parsing (single-pass metadata extraction)
2. Preventing unnecessary refreshes (loading state management, warmup filtering)
3. Utilizing cache effectively (60s TTL, selective invalidation)
4. Processing files in parallel (Promise.all vs sequential)

## [0.2.0] - 2025-10-27

### The Journey

This release represents several days of intensive reverse-engineering of Claude Code's conversation file format. When Anthropic announced they were working on features like "rename conversations," we couldn't wait - these are essential quality-of-life features that users need now. So we dove deep into the undocumented `.jsonl` format to figure out how Claude Code actually works.

The journey was challenging. The conversation files use a complex format with cross-file references, warmup messages, sidechain reconnections, and subtle timestamp behaviors that weren't immediately obvious. Through careful analysis of hundreds of conversation files, manual testing, and comparing our output against Claude Code's behavior pixel by pixel, we finally cracked it.

### Added

- **Clickable Conversations**: Click any conversation in the tree to open it in Claude Code
- **Accurate Timestamps**: Conversations now show the exact same relative times as Claude Code (Today, Yesterday, Past week, etc.)
- **Perfect Sorting**: Conversations are sorted exactly like Claude Code's list
  - Discovered that Claude Code uses the last non-sidechain message timestamp for sorting
  - Warmup and reconnection messages are properly ignored
  - Cross-file summary references are properly handled
- **Smart Title Extraction**: Implemented the exact title priority logic that Claude Code uses
  - First user message content takes priority
  - Falls back to assistant response if no user message
  - Handles edge cases like warmup-only conversations
- **Comprehensive Documentation**: Added detailed findings documentation explaining the `.jsonl` format discoveries

### Fixed

- **Timestamp Accuracy**: Fixed conversations showing "12h ago" when Claude Code showed "6d ago"
  - Root cause: We were using warmup message timestamps instead of actual conversation timestamps
  - Solution: Scan backward through messages to find last non-sidechain message
- **Sort Order**: Fixed conversations appearing in different order than Claude Code
  - Implemented proper tiebreaking when display times are identical
  - Now matches Claude Code's list exactly
- **Title Display**: Fixed title extraction to match Claude Code's priority system
  - Warmup conversations now show appropriate titles
  - Empty conversations are properly identified

### Changed

- **Conversation Detection**: Improved logic to distinguish between real conversations and warmup-only sessions
- **File Organization**: Moved documentation to `docs/`, debug scripts to `debug/`, build artifacts to `dist/`

### Technical Notes

For developers interested in the `.jsonl` format, see [docs/FINDINGS.md](docs/FINDINGS.md) for detailed documentation on:
- Message structure and types
- Cross-file summary mechanism (leafUuid)
- Sidechain vs non-sidechain messages
- Timestamp extraction logic
- Title priority system
- Conversation sorting algorithm

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
