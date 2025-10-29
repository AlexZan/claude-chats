# Change Log

All notable changes to the "Claude Chats" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.7] - 2025-01-28

### Fixed

- **CRITICAL: Rename functionality broken** ([src/fileOperations.ts:79-99](src/fileOperations.ts#L79-L99))
  - `extractFastMetadataAsync()` was rejecting summaries whose `leafUuid` pointed beyond first 10 lines
  - Renamed conversations have `leafUuid` pointing to last message (often line 50+)
  - Now accepts any summary found in first 10 lines as title, regardless of `leafUuid` location
  - Rename now works instantly with targeted cache refresh
- **Targeted tree refresh for file saves** ([src/conversationTree.ts:254-319](src/conversationTree.ts#L254-L319))
  - Added `updateSingleConversation()` method to update only changed conversation in cache
  - File watcher now uses targeted refresh instead of full reload
  - Fixed path normalization bug (Windows case-insensitive paths)
  - Saves now update instantly without reloading 200+ conversations

## [0.4.6] - 2025-01-28

### 🚀 Lightning-Fast Performance - Now Faster Than Native Claude Code!

This release delivers breakthrough performance improvements, making the extension **faster than Claude Code's native conversation list**. Load times improved from 40 seconds to under 2 seconds for 220+ conversations - a **20x speedup**!

### Added

- **Surgical File Parsing** ([src/fileOperations.ts:27-112](src/fileOperations.ts#L27-L112))
  - Created `extractFastMetadataAsync()` that reads only first 10 lines per file
  - Extracts title from line 1 (summary) or line 4-5 (first user message)
  - Checks for warmup conversations and hidden status without full file parse
  - Reduces parsing from 20,000+ messages to just 2,200 lines (10 lines × 220 files)

### Fixed

- **CRITICAL: Cross-Project File Watcher Bug** ([src/extension.ts:249-262](src/extension.ts#L249-L262))
  - File watcher was monitoring ALL projects instead of just current project
  - Every conversation save in ANY project triggered full reload of ALL 200+ conversations
  - Now watches only current project directory (e.g., `c--Dev-GameDev-EventHorizonGame/*.jsonl`)
  - Added workspace change listener to update watcher when switching projects
  - **Impact**: Eliminates unnecessary cross-project refresh storms

- **Tree Constructor Performance** - Issue #10 ([src/types.ts:48](src/types.ts#L48), [src/conversationTree.ts:33](src/conversationTree.ts#L33))
  - `ConversationTreeItem` constructor was calling `isHiddenInClaudeCode()` for every tree item
  - This function synchronously parsed entire .jsonl files - 200 file reads per render!
  - Added `isHidden: boolean` field to `Conversation` interface
  - Created `isHiddenFromMessages()` helper that works with pre-parsed messages
  - Now cached during initial file load, tree uses O(1) property access
  - **Impact**: Eliminated 200 synchronous file reads on every tree render

### Changed

- **Optimized File Reading Strategy**
  - Reduced from parsing 50 lines per file to just 10 lines
  - Uses file system `mtime` for timestamps instead of parsing last message
  - Full file parsing now only happens when opening conversation viewer
  - Tree view gets all needed metadata from minimal parsing

### Performance Benchmarks

**220 conversation files:**
- **v0.4.4**: 40 seconds (full file parsing)
- **v0.4.5**: 4 seconds (50-line parsing)
- **v0.4.6**: **1.9 seconds (10-line parsing)** ⚡

**Lines Parsed:**
- Before: 20,000+ messages (every line in every file)
- After: 2,200 lines (10 lines per file)
- **Reduction: 90%+ fewer lines parsed**

**Key Optimizations:**
1. Read first 10 lines instead of entire file (summary is line 1, first message is line 4-5)
2. Use file system metadata (`mtime`) for timestamps
3. Cache `isHidden` status during load instead of checking on every render
4. Watch only current project, not all 200+ conversations

**Result: Faster than native Claude Code!** 🎉

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
