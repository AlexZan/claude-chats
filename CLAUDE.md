# Claude Chats - Development Guide

This document contains important instructions for Claude when working on this project.

## Project Overview

This is a VS Code extension that manages Claude Code conversations (.jsonl files). It provides:
- True conversation renaming (modifies actual .jsonl files)
- Archive/restore functionality
- Search across conversations
- Custom viewer for conversation files
- Lightning-fast performance (faster than native Claude Code)

## Communication Guidelines

**IMPORTANT - Push Back When I'm Wrong:**
- If something doesn't make sense or facts contradict what I'm saying, tell me directly
- Don't let me chase "ghosts" or waste time hunting for non-existent problems
- Better to say "that's wrong, here's why" than to let me spin wheels trying to prove an incorrect premise
- This applies especially to technical facts (git status, file existence, compiler output, etc.)
- Objective truth matters more than being polite

**IMPORTANT**: When estimating effort or complexity:
- **NEVER** provide estimates in human time (hours, days, weeks)
- **ALWAYS** estimate in terms of token cost or complexity
- Use qualitative descriptors: "low token cost", "moderate complexity", "high token usage"
- If specific numbers are needed, estimate in tokens (e.g., "~5K-10K tokens")
- Focus on technical complexity rather than time duration

**Example:**
- ❌ "This will take 2-3 hours"
- ✅ "This is a low-complexity task, approximately 5K-8K tokens"
- ✅ "This is moderately complex, expect ~15K-20K token usage"

## Publishing Workflow

**IMPORTANT**: Never publish to the marketplace without explicit user approval.

### Pre-Publish Checklist

1. **Update version number** in `package.json`
2. **Update CHANGELOG.md** with changes
3. **Update README.md** if user-facing features changed
4. **Compile TypeScript**: `npm run compile`
5. **Test the changes** - User should manually test critical paths
6. **Commit changes**: `git add -A && git commit -m "..."`
7. **Wait for user approval**

### Publishing Steps (ONLY after user approval)

```bash
# Push to GitHub
git push origin master

# Publish to VS Code Marketplace
npx @vscode/vsce publish
```

**Never run these commands without explicit user approval!**

### Version Numbering

- **Patch** (0.4.x): Bug fixes, small improvements
- **Minor** (0.x.0): New features, non-breaking changes
- **Major** (x.0.0): Breaking changes

## Code Quality Standards

### Code Reuse and Abstraction

**IMPORTANT**: Before implementing any new functionality:

1. **Search for existing systems** that solve similar problems
   - Use Grep/Glob to search for similar functionality in the codebase
   - Check if existing functions can be reused or extended
   - Example: Don't create duplicate file parsing logic if `extractFastMetadataAsync()` exists

2. **Evaluate abstraction opportunities**
   - If code would be duplicated, consider creating a shared utility
   - Only abstract when there are 2+ actual use cases (avoid premature abstraction)
   - Shared logic should be placed in appropriate files:
     - File operations → `src/fileOperations.ts`
     - Path utilities → `src/utils.ts` (create if needed)
     - Conversation logic → `src/conversationManager.ts`

3. **Smart abstraction decisions**
   - **DO abstract** when:
     - Same logic appears 2+ times with minor variations
     - Future features will likely need the same functionality
     - Abstraction reduces complexity rather than hiding it
   - **DON'T abstract** when:
     - Only one use case exists currently
     - Abstraction adds more complexity than it removes
     - The "similar" code has different underlying semantics

### Clean Code Principles

All code must follow these principles:

1. **Single Responsibility Principle**
   - Each function does ONE thing well
   - Functions should be 20-50 lines max (exceptions for complex logic with comments)
   - Classes should have a single, well-defined purpose

2. **Meaningful Names**
   - Variables: descriptive nouns (`conversationCache`, not `data`)
   - Functions: verb phrases (`extractFastMetadataAsync`, not `getMeta`)
   - Booleans: questions (`isArchived`, `hasValidTitle`)
   - Avoid abbreviations unless universally known (`msg` → `message`)

3. **DRY (Don't Repeat Yourself)**
   - Extract repeated logic into functions
   - Use parameters to handle variations
   - But prefer clarity over extreme DRYness

4. **Error Handling**
   - Always handle potential errors gracefully
   - Provide meaningful error messages
   - Log errors with context: `console.error('Failed to rename conversation', filePath, error)`

5. **Comments**
   - Explain WHY, not WHAT (code should be self-documenting)
   - Document non-obvious performance optimizations
   - Add TODO comments for known technical debt
   - Example: `// Read only first 10 lines for performance - summaries are always at the top`

6. **Function Structure**
   - Early returns for error cases
   - Guard clauses at the top
   - Happy path should be the main body
   ```typescript
   // Good
   function process(data: Data | null): Result {
     if (!data) return null;
     if (!data.isValid) return null;

     // Main logic here
     return result;
   }
   ```

7. **Immutability**
   - Prefer `const` over `let`
   - Avoid mutating function parameters
   - Use array methods that return new arrays (`.map()`, `.filter()`)

8. **Type Safety**
   - Use TypeScript types, avoid `any`
   - Prefer interfaces for object shapes
   - Use union types for known variations
   - Define return types explicitly on functions

**Example of applying these principles:**

❌ **Bad:**
```typescript
function doStuff(d: any) {
  let x = d.split('\n');
  let y = x[0];
  if (y.includes('summary')) {
    let z = JSON.parse(y);
    return z.content;
  }
  return null;
}
```

✅ **Good:**
```typescript
function extractSummaryFromJsonl(fileContent: string): string | null {
  const lines = fileContent.split('\n');
  const firstLine = lines[0];

  if (!firstLine?.includes('"type":"summary"')) {
    return null;
  }

  try {
    const message = JSON.parse(firstLine);
    return message.content || null;
  } catch (error) {
    console.error('Failed to parse JSONL summary line', error);
    return null;
  }
}
```

## Critical Implementation Notes

### Performance Optimizations

1. **Surgical File Parsing** ([src/fileOperations.ts:30-112](src/fileOperations.ts#L30-L112))
   - `extractFastMetadataAsync()` reads only first 10 lines
   - Extracts title from line 1 (summary) or line 4-5 (first user message)
   - NEVER add `leafUuid` validation here - it breaks rename functionality
   - Summaries can have `leafUuid` pointing beyond line 10 (normal for longer conversations)

2. **Targeted Tree Refresh** ([src/conversationTree.ts:254-319](src/conversationTree.ts#L254-L319))
   - `updateSingleConversation()` updates only changed conversation in cache
   - File watcher calls this instead of full `refresh()`
   - Path normalization is critical for Windows (case-insensitive, backslash vs forward slash)

3. **File Watching** ([src/extension.ts:342-378](src/extension.ts#L342-L378))
   - Only watches current project directory, not all Claude Code conversations
   - 500ms debounce to batch rapid file changes
   - Ignores warmup-only conversations
   - Auto-updates stale leafUuid values

### Common Pitfalls

1. **Don't add leafUuid validation to title extraction**
   - The `extractFastMetadataAsync()` function should accept ANY summary in the first 10 lines
   - The `leafUuid` can point to messages at line 50+ in longer conversations
   - This is normal and expected behavior

2. **Always use targeted refresh for in-place file modifications**
   - Rename: use `updateSingleConversation()`, not `refresh()`
   - File saves: file watcher calls `updateSingleConversation()` automatically
   - Archive/Restore: use `refresh()` because file path changes

3. **Path normalization on Windows**
   - Always normalize paths for comparison: `path.toLowerCase().replace(/\\/g, '/')`
   - Windows paths can have different casing (`C:\` vs `c:\`)
   - Backslashes vs forward slashes

4. **Claude Code's Auto-Compact Creates Multiple Conversation Chains**
   - **Critical Discovery**: When conversations reach ~100 messages, Claude Code "compacts" them
   - Compaction creates a NEW root message (type: "system") with `parentUuid: null` somewhere in the middle of the file
   - This results in TWO separate conversation chains in the same file:
     - **Chain 1**: Original conversation starting from first message after summary (line 2)
     - **Chain 2**: Compacted conversation starting from system message (e.g., line 499)
   - Old messages (Chain 1) remain in the file but become orphaned/disconnected
   - **Claude Code expects leafUuid to point to the ACTIVE chain** (the one starting from the first root message after the summary)
   - If leafUuid points to Chain 2 but Claude Code expects Chain 1, the summary will be rejected
   - **Fix**: `checkForStaleLeafUuid()` must find the PRIMARY chain (first root after summary) and use its last message as leafUuid
   - See "leafUuid Validation Logic" section below for implementation details

### leafUuid Validation Logic

**Problem**: Claude Code validates that a summary's `leafUuid` points to the last message in the PRIMARY conversation chain (the one starting from the first message after the summary).

**How Claude Code's Compaction Works**:
1. Conversation starts normally with summary at line 1, first message at line 2 with `parentUuid: null`
2. After ~100 messages, Claude Code "compacts" the conversation
3. It inserts a new "system" message with `parentUuid: null` (e.g., at line 499)
4. All subsequent messages chain from this new root, creating Chain 2
5. Old messages (Chain 1) remain but become orphaned

**Validation Requirements**:
- Summary's `leafUuid` must point to the last non-sidechain message in the PRIMARY chain
- Primary chain = the chain starting from the FIRST root message after the summary (line 2)
- Even if there are multiple chains in the file, leafUuid must reference Chain 1

**Implementation** (`checkForStaleLeafUuid`):
1. Find summary at line 1
2. Find first message after summary with `parentUuid: null` (this is the primary chain root)
3. Build a set of all UUIDs that belong to this chain by following parent relationships
4. Find the last non-sidechain message within this chain (by timestamp)
5. If summary's leafUuid doesn't match this UUID, it's stale

**Example**:
```
Line 1:   {"type":"summary","leafUuid":"ABC"}
Line 2:   {"uuid":"ROOT1","parentUuid":null}  ← Primary chain starts
Line 100: {"uuid":"ABC","parentUuid":"..."}   ← Chain 1 ends
Line 499: {"uuid":"ROOT2","parentUuid":null}  ← Chain 2 starts (compact)
Line 805: {"uuid":"XYZ","parentUuid":"..."}   ← Chain 2 ends

Claude Code expects leafUuid = "ABC" (from Chain 1), NOT "XYZ" (from Chain 2)
```

## Testing Checklist

Before publishing:

- [ ] Test rename functionality
- [ ] Test archive/restore
- [ ] Test search
- [ ] Test file watching (save a conversation in Claude Code)
- [ ] Test with 200+ conversations (performance)
- [ ] Test on fresh VS Code reload
- [ ] Verify no TypeScript errors: `npm run compile`

## Architecture

### Key Files

- `src/extension.ts` - Extension entry point, command registration, file watching
- `src/conversationTree.ts` - Tree view provider, caching, targeted refresh
- `src/fileOperations.ts` - File I/O, metadata extraction, rename/archive operations
- `src/conversationManager.ts` - High-level conversation operations
- `src/conversationViewer.ts` - Custom webview for viewing conversations
- `src/searchPanel.ts` - Search functionality

### Data Flow

1. Extension activates → creates TreeProvider
2. TreeProvider loads conversations → calls `getAllConversationsAsync()`
3. User action (rename, archive) → calls `ConversationManager` method
4. Manager calls `FileOperations` to modify file
5. File watcher detects change → calls `updateSingleConversation()` for targeted refresh
6. TreeProvider updates cache and fires refresh event
7. VS Code re-renders tree with updated data

## GitHub Issues

Track open issues at: https://github.com/AlexZan/claude-chats/issues

### Working on an Issue

1. **Check current open issues**: `gh issue list --state open`
2. **Pick an issue** to work on
3. **Reference issue in commit**: Use `Fixes #123` or `Closes #123` in commit message
   - GitHub will automatically link the commit to the issue
4. **Update CHANGELOG.md** with the fix
5. **After publishing**, close the issue manually with details

### Closing an Issue

Use the GitHub CLI to close with a detailed comment:

```bash
gh issue close <number> --comment "Fixed in v0.x.x!

**Implementation:**
- Brief description of changes
- Link to relevant code sections
- Key technical details

**Results:**
- User-facing improvements
- Performance metrics if applicable

Commit: <commit-hash>"
```

**Example:**
```bash
gh issue close 13 --comment "Fixed in v0.4.7!

**Implementation:**
- Added updateSingleConversation() method
- File watcher uses targeted refresh

**Results:**
- Updates in ~3ms instead of 2+ seconds
- No full reload on file saves

Commit: 3ac5fe1"
```

### Automatic Issue Closing

GitHub can automatically close issues when commits are merged if you use keywords in commit messages:
- `Fixes #123` - Closes issue #123
- `Closes #123` - Closes issue #123
- `Resolves #123` - Closes issue #123

However, we prefer manual closing with detailed comments to provide better context.

## Contact

For questions or issues, contact user via GitHub issues.
