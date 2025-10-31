# Testing Debug Command - Phase 1 Discovery

## Goal
Discover Claude Code's tab characteristics to determine if we can implement direct tab detection.

## Setup Complete ✅

The debug command has been added to the extension:
- [src/debugTabInfo.ts](src/debugTabInfo.ts) - Debug utility
- [src/extension.ts](src/extension.ts) - Command registered
- [package.json](package.json) - Command definition added
- Compilation successful

## Testing Procedure

### Step 1: Reload Extension
1. Press `F5` or go to Run > Start Debugging
2. This will open a new VS Code window with the extension loaded

### Step 2: Open a Claude Code Chat
1. In the Extension Development Host window, open a Claude Code chat
2. Make sure the chat tab is **active** (selected)

### Step 3: Run Debug Command
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type: `Claude Code: Debug Active Tab Info`
3. Press Enter

### Step 4: Review Output
The debug info will appear in the "Tab Debug Info" output channel:
- Look for the `viewType` of the active tab
- Check if conversation ID/UUID is visible in any property
- Note the tab label format (truncated title)

## What to Look For

### Critical Information:
1. **Tab Input Type**: Is it `TabInputWebview` or `TabInputCustom`?
2. **View Type**: What is the exact `viewType` string?
3. **URI Information**: If `TabInputCustom`, what's in the `uri`?
4. **Conversation ID**: Is the UUID (e.g., `19c76896-e86c-4669-b478-ab3c8427904a`) visible anywhere?
5. **Tab Label**: How is the title displayed/truncated?

### Example Output to Expect:

```
=== ACTIVE TAB INFO ===
Label: "Fix authentication bug in..."
Is Active: true
Is Dirty: false
Is Pinned: false
Is Preview: false

=== INPUT INFO ===
Type: TabInputWebview (webview panel)
View Type: "claude.chat.view"  <-- IMPORTANT!

=== ALL TABS IN GROUP ===
1. "extension.ts" (inactive)
2. "Fix authentication bug in..." (ACTIVE)
   -> Webview: claude.chat.view
```

## Optional: Enable Tab Monitoring

For automatic detection, uncomment this line in [src/extension.ts:261](src/extension.ts#L261):

```typescript
// Optional: Start tab monitoring (uncomment to enable)
startTabMonitoring(context);
```

This will log all tab changes automatically to "Claude Code Tab Monitor" output channel.

## After Testing

Please document findings in [RENAME-BUTTON-RESEARCH.md](RENAME-BUTTON-RESEARCH.md) under "Open Questions" section:

```markdown
## Discovery Results (Phase 1)

**Date:** [today's date]
**Claude Code Version:** [version]

**Findings:**
- Tab Input Type: [TabInputWebview | TabInputCustom | other]
- View Type: "[exact string]"
- URI Format: [if applicable]
- Conversation UUID visible: [yes/no - where?]
- Tab Label Format: [description]

**Feasibility Assessment:**
- Direct detection possible: [yes/no]
- Recommended approach: [Option 1/2/3/4]
```

## Next Steps Based on Results

### If `viewType` is discoverable and UUID is accessible:
→ Proceed to **Phase 2A** (Direct Detection)
- Implement tab detection with exact `viewType` match
- Extract conversation ID from discovered property
- Add context-aware status bar button

### If `viewType` is not Claude Code specific OR UUID not accessible:
→ Proceed to **Phase 2B** (Fuzzy Match + Fallback)
- Implement fuzzy title matching
- Add always-visible status bar button
- Smart conversation picker with recent sort

## Troubleshooting

**Problem:** Command not appearing in palette
- Solution: Restart extension host (Ctrl+Shift+F5)
- Verify command is in package.json `contributes.commands`

**Problem:** "No active tab" message
- Solution: Make sure a tab is selected/active
- Try clicking on the tab first

**Problem:** Extension not loading
- Solution: Check Debug Console for errors
- Run `npm run compile` again
- Check `out/` directory has compiled .js files

## Current Status

- ✅ Code changes complete
- ✅ Compilation successful
- ⏳ Awaiting manual testing in Extension Development Host
- ⏳ Document findings
- ⏳ Decide on implementation approach
