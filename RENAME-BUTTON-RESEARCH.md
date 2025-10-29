# Quick Rename Button Research - Discovery Phase

## Goal
Allow users to rename the current Claude Code chat without using the sidebar tree view. Ideally via a status bar button or command that detects the active chat.

## Current State

### Existing Functionality
- ✅ Command `claudeCodeConversationManager.renameCurrentConversation` exists
- ✅ Works when a `.jsonl` file is open in text editor
- ❌ Does NOT work when Claude Code chat interface is open (likely a webview)

**Current implementation:** [conversationManager.ts:143-159](src/conversationManager.ts#L143-L159)

```typescript
getCurrentConversationId(): string | null {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return null;

  const filePath = activeEditor.document.fileName;
  if (!filePath.endsWith('.jsonl')) return null;

  // Extract conversation ID from filename
  const fileName = filePath.split(/[/\\]/).pop();
  return fileName ? fileName.replace('.jsonl', '') : null;
}
```

**Limitation:** Only detects `.jsonl` files in text editor, not Claude Code's webview interface.

---

## Technical Research Findings

### 1. VS Code Tab API Discovery

**Available API:** `window.tabGroups` (since VS Code 1.95.0 - we're already targeting this!)

```typescript
interface Tab {
  label: string;        // Displayed tab title (may be truncated!)
  isActive: boolean;    // Is this the active tab?
  input: TabInputWebview | TabInputCustom | TabInputText | ...
}

// For webviews (likely what Claude Code uses)
interface TabInputWebview {
  viewType: string;  // Unique identifier for the webview type
}

// For custom editors
interface TabInputCustom {
  uri: Uri;          // Resource URI
  viewType: string;  // Custom editor type
}
```

**Key Properties:**
- `tab.label` - The visible tab title (truncated if too long)
- `tab.input.viewType` - Identifies the type of editor/webview
- `tab.input.uri` - May contain conversation file path or ID (for custom editors)
- `tab.isActive` - Know when Claude Code tab is active

### 2. Conversation File Structure

**File naming:** `{uuid}.jsonl`
- Example: `19c76896-e86c-4669-b478-ab3c8427904a.jsonl`
- Located in: `~/.claude/projects/{project-name}/`

**Title extraction logic:** [fileOperations.ts:723](src/fileOperations.ts#L723)
1. Local summary message (for renamed conversations)
2. Cross-file summary via `leafUuid` reference
3. First user message as fallback

**Key insight:** Titles in tabs may not match filenames, so we need to map title → conversation file.

---

## Proposed Approaches

### Option 1: Direct Tab Detection ⭐ (IDEAL)

**How it works:**
1. Monitor `window.tabGroups.onDidChangeTabs`
2. When tab becomes active, check if it's a Claude Code chat:
   - Check `tab.input.viewType` (e.g., "claude.chat" or similar)
   - Or check `tab.input.uri` scheme/path
3. Extract conversation identifier from tab properties
4. Show status bar button: "✏️ Rename Chat"
5. Click → rename dialog → update conversation file

**Requirements:**
- ❓ Need to discover Claude Code's `viewType` (unknown)
- ❓ Need to find if conversation UUID is in `uri` or other property

**Pros:**
- ✅ Exactly what user wants - seamless UX
- ✅ Works immediately when chat tab is active
- ✅ No ambiguity - knows exact conversation

**Cons:**
- ❓ Requires reverse-engineering Claude Code's tab structure
- ❓ May break if Claude Code changes internal implementation

**Confidence:** Needs discovery phase (see Implementation Plan below)

---

### Option 2: Fuzzy Match on Tab Title

**How it works:**
1. Get active tab's `label` (truncated title)
2. Fuzzy search through all conversation titles
3. If single strong match → allow rename
4. If multiple matches → show quick pick to disambiguate
5. If no match → fall back to full conversation list

**Implementation:**
```typescript
function findConversationByTabLabel(tabLabel: string): Conversation | null {
  const allConversations = getAllConversations();

  // Direct match (full title)
  const exact = allConversations.find(c => c.title === tabLabel);
  if (exact) return exact;

  // Partial match (tab label is truncated)
  const matches = allConversations.filter(c =>
    c.title.startsWith(tabLabel) ||
    c.title.includes(tabLabel)
  );

  // Return if single match, null if ambiguous or not found
  return matches.length === 1 ? matches[0] : null;
}
```

**Pros:**
- ✅ No dependency on Claude Code internals
- ✅ Can implement immediately without discovery
- ✅ Works with any tab type (webview, custom, text)

**Cons:**
- ⚠️ Tab labels are truncated - may cause ambiguity
- ⚠️ Multiple conversations with similar titles → false matches
- ⚠️ Won't work if title is very generic (e.g., "Help me with...")

**Confidence:** Medium - workable but not perfect

---

### Option 3: Smart Command with Fallback

**How it works:**
1. User invokes command (or clicks status bar button)
2. Try to detect active Claude Code chat:
   - Check `window.activeTextEditor` for `.jsonl` files (current logic)
   - Check `window.tabGroups.activeTabGroup.activeTab` for webviews
   - Try fuzzy match on tab label
3. If detected → show rename dialog immediately
4. If ambiguous → show quick pick with likely matches (sorted by recent)
5. If no detection → show full conversation list (sorted by last modified)

**Pros:**
- ✅ Best of both worlds - smart detection + safe fallback
- ✅ Always works, even if detection fails
- ✅ Users can still use it from command palette anywhere

**Cons:**
- ⚠️ Extra step if fuzzy match fails
- ⚠️ Not as seamless as Option 1

**Confidence:** High - guaranteed to work

---

### Option 4: Status Bar Button (Always Visible)

**How it works:**
1. Show "✏️ Rename Chat" button in status bar (always)
2. Click → open quick pick with conversations (sorted by recent, with timestamps)
3. User selects conversation → rename dialog

**Pros:**
- ✅ Simple, no detection needed
- ✅ Always accessible
- ✅ Can add "⏱️ 5 min ago" timestamps for easy identification

**Cons:**
- ⚠️ Not context-aware
- ⚠️ Extra click to select conversation

**Confidence:** High - simplest implementation

---

## Recommended Implementation Strategy

### Phase 1: Discovery & Research ⏱️ 1-2 hours
**Goal:** Determine if Option 1 (ideal) is feasible

1. Add debug command to log active tab information:
   - Use provided `debug-tab-info.ts` utility
   - Open Claude Code chat and run debug command
   - Discover `viewType` and available properties

2. Check if conversation UUID is accessible:
   - Look at `tab.input.uri` for custom editors
   - Check for any hidden properties via JSON.stringify
   - Test with multiple conversations

3. Document findings:
   - Record Claude Code's `viewType`
   - Note if UUID is accessible and how
   - Assess feasibility of direct detection

**If successful → proceed to Phase 2A**
**If blocked → proceed to Phase 2B**

---

### Phase 2A: Direct Detection (if Phase 1 successful) ⏱️ 3-4 hours

1. **Create detection utility** (`src/claudeCodeDetection.ts`):
   ```typescript
   export function isClaudeCodeChatTab(tab: Tab): boolean {
     if (tab.input instanceof TabInputWebview) {
       return tab.input.viewType === 'discovered-viewtype';
     }
     return false;
   }

   export function extractConversationId(tab: Tab): string | null {
     // Extract UUID from uri or other property
   }
   ```

2. **Add status bar button**:
   ```typescript
   const statusBarItem = vscode.window.createStatusBarItem(
     vscode.StatusBarAlignment.Right,
     100
   );
   statusBarItem.text = '$(edit) Rename Chat';
   statusBarItem.command = 'claudeCodeConversationManager.renameActiveChat';
   statusBarItem.tooltip = 'Rename the current Claude Code chat';

   // Only show when Claude Code chat is active
   context.subscriptions.push(
     vscode.window.tabGroups.onDidChangeTabs(() => {
       const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
       if (activeTab && isClaudeCodeChatTab(activeTab)) {
         statusBarItem.show();
       } else {
         statusBarItem.hide();
       }
     })
   );
   ```

3. **Wire up rename logic**:
   - Reuse existing `manager.rename()` method
   - Add error handling for edge cases

4. **Add user preference**:
   ```json
   "claudeChats.showStatusBarButton": {
     "type": "boolean",
     "default": true,
     "description": "Show quick rename button in status bar when Claude Code chat is active"
   }
   ```

**Deliverable:** Context-aware status bar button that appears only for Claude Code chats

---

### Phase 2B: Fuzzy Match + Fallback (if Phase 1 blocked) ⏱️ 2-3 hours

1. **Enhance existing command**:
   ```typescript
   async renameCurrentConversation() {
     // Try 1: Detect .jsonl file (existing logic)
     let conversation = this.detectFromTextEditor();

     // Try 2: Fuzzy match on tab label
     if (!conversation) {
       conversation = await this.detectFromTabLabel();
     }

     // Try 3: Show recent conversations picker
     if (!conversation) {
       conversation = await this.showConversationPicker();
     }

     if (!conversation) return;

     // Show rename dialog
     const newTitle = await this.promptForNewTitle(conversation);
     if (newTitle) {
       await this.manager.rename(conversation, newTitle);
     }
   }
   ```

2. **Add status bar button** (always visible):
   ```typescript
   const statusBarItem = vscode.window.createStatusBarItem(
     vscode.StatusBarAlignment.Right,
     100
   );
   statusBarItem.text = '$(edit) Rename';
   statusBarItem.command = 'claudeCodeConversationManager.renameCurrentConversation';
   statusBarItem.tooltip = 'Rename Claude Code conversation';
   statusBarItem.show();
   ```

3. **Improve conversation picker**:
   - Sort by last modified (most recent first)
   - Add relative timestamps: "5 minutes ago", "2 hours ago"
   - Show project context: "Project: MyApp"
   - Highlight currently active conversation (if detected)

**Deliverable:** Smart command that tries multiple detection methods + always-accessible button

---

### Phase 3: Polish & Testing ⏱️ 1-2 hours

1. Add telemetry/logging:
   - Track which detection method succeeds
   - Log failure cases for future improvement

2. Edge case handling:
   - Multiple conversations with identical titles
   - Very short tab labels (heavy truncation)
   - Rapid tab switching

3. User documentation:
   - Update README with new feature
   - Add demo GIF/screenshot
   - Document any limitations

4. Testing:
   - Test with 5+ conversations with similar names
   - Test with truncated titles
   - Test status bar button show/hide behavior
   - Test from command palette

---

## Files to Modify/Create

### New Files
- `src/claudeCodeDetection.ts` - Tab detection logic
- `debug-tab-info.ts` - Temporary debug utility (delete after Phase 1)
- `test-tab-detection.md` - Research notes (already created)

### Modified Files
- `src/extension.ts` - Add status bar button, register new commands
- `src/conversationManager.ts` - Enhance detection logic
- `package.json` - Add commands, configuration settings
- `README.md` - Document new feature

---

## Discovery Tasks (Next Steps)

To complete Phase 1 discovery:

1. **Add debug command to `extension.ts`:**
   ```typescript
   import { debugActiveTab, startTabMonitoring } from './debug-tab-info';

   // In activate():
   context.subscriptions.push(
     vscode.commands.registerCommand(
       'claudeCodeConversationManager.debugTabInfo',
       debugActiveTab
     )
   );

   // Optional: Auto-monitor tabs
   // startTabMonitoring(context);
   ```

2. **Add to `package.json` commands:**
   ```json
   {
     "command": "claudeCodeConversationManager.debugTabInfo",
     "title": "Claude Code: Debug Active Tab Info"
   }
   ```

3. **Test procedure:**
   - Compile and run extension
   - Open a Claude Code chat conversation
   - Run command from palette: "Claude Code: Debug Active Tab Info"
   - Check "Tab Debug Info" output channel
   - Document `viewType` and available properties

4. **Answer these questions:**
   - What is Claude Code's webview/custom editor `viewType`?
   - Is the conversation UUID available in any tab property?
   - Is the full (non-truncated) title available?
   - Does the URI contain any useful information?

---

## Open Questions

- ❓ Does Claude Code use `TabInputWebview` or `TabInputCustom`?
- ❓ What is the exact `viewType` string?
- ❓ Is conversation UUID exposed in tab properties?
- ❓ How does Claude Code handle conversation titles in tab labels?
- ❓ What happens when multiple chats are open?

**These will be answered in Phase 1 discovery.**

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude Code's `viewType` not discoverable | High | Fall back to Option 2/3 (fuzzy match) |
| Conversation ID not in tab properties | High | Use fuzzy match on title + recent sort |
| Tab labels too ambiguous (truncation) | Medium | Show disambiguation picker |
| Claude Code changes internal structure | Low | Monitor for issues, add version checks |
| Performance with 100+ conversations | Low | Already optimized with caching |

---

## Success Metrics

**Minimum Viable Product (MVP):**
- ✅ Status bar button visible when appropriate
- ✅ Clicking button opens rename dialog for correct conversation
- ✅ Works for at least 80% of common use cases
- ✅ Graceful fallback when detection fails

**Stretch Goals:**
- ✅ 100% accurate detection (no fuzzy matching needed)
- ✅ Instant rename (no picker needed)
- ✅ Works with keyboard shortcut
- ✅ Shows "last modified" time to help identification

---

## Conclusion

**Recommended path:**
1. Complete Phase 1 discovery (1-2 hours) to determine feasibility
2. If successful → implement Phase 2A (direct detection)
3. If blocked → implement Phase 2B (fuzzy match + fallback)
4. Either way, deliver working solution with good UX

**Confidence levels:**
- Phase 2B (fuzzy match): 90% - will definitely work
- Phase 2A (direct detection): 60% - depends on Claude Code's internals

**Time estimate:**
- Phase 1: 1-2 hours
- Phase 2A or 2B: 2-4 hours
- Phase 3: 1-2 hours
- **Total: 4-8 hours** for full implementation

**User value:** High - eliminates need to use sidebar for simple rename operations.
