# Claude Chats Menu Feature - Testing Guide

## What Changed

The status bar button has been upgraded from a simple "Rename" button to a full action menu!

### Before (v0.5.0)
- Button: `$(edit) Rename`
- Action: Direct rename only

### After (v0.5.1)
- Button: `$(comment-discussion) Claude Chats`
- Action: Shows menu with multiple options

---

## Menu Options

When you click the "Claude Chats" button, you'll see:

```
✏️ Rename
  Change conversation title

✓ Mark as Done  (or ✗ Mark as Undone if already done)
  Add/remove done checkmark

📦 Archive  (or 🔓 Restore if archived)
  Move to/from archive

─────────────────────

📋 Export to Markdown
  Save conversation as .md file

🗑️ Delete
  Permanently delete conversation
```

---

## How to Test

### Setup
1. Press `F5` to launch Extension Development Host
2. Open a Claude Code chat
3. Look for **"💬 Claude Chats"** button in status bar (bottom-right)

### Test Case 1: Menu Shows Correct Options
1. Click "Claude Chats" button
2. **Expected:** Menu appears with all 5 options
3. Verify icons and descriptions are clear
4. Press ESC to cancel

### Test Case 2: Rename from Menu
1. Click "Claude Chats" → "✏️ Rename"
2. **Expected:** Input box appears with current title
3. Enter new title → Submit
4. **Expected:** Success message with reload reminder
5. Close and reopen chat tab → verify title updated

### Test Case 3: Toggle Done Status
1. Click "Claude Chats" → "✓ Mark as Done"
2. **Expected:** Title gets ✓ prefix
3. Click again → "✗ Mark as Undone"
4. **Expected:** ✓ prefix removed

### Test Case 4: Archive/Restore
1. Click "Claude Chats" → "📦 Archive"
2. **Expected:** Confirmation dialog (if enabled in settings)
3. Confirm → Conversation moves to archive
4. Open archived conversation
5. Click "Claude Chats" → "🔓 Restore"
6. **Expected:** Conversation restored to active

### Test Case 5: Export to Markdown
1. Click "Claude Chats" → "📋 Export to Markdown"
2. **Expected:** Save dialog appears
3. Choose location and save
4. **Expected:** File created, option to open

### Test Case 6: Delete Conversation
1. Create a test conversation
2. Click "Claude Chats" → "🗑️ Delete"
3. **Expected:** Confirmation dialog
4. Confirm → Conversation deleted permanently

### Test Case 7: State-Aware Menu
1. Create conversation with ✓ prefix
2. Open it → Click "Claude Chats"
3. **Expected:** Shows "✗ Mark as Undone" (not "Mark as Done")
4. Archive the conversation
5. Click "Claude Chats"
6. **Expected:** Shows "🔓 Restore" (not "Archive")

### Test Case 8: Detection Fallback
1. Close all Claude Code chats
2. Run command from palette: "Claude Code: Show Claude Chats Menu"
3. **Expected:** Shows conversation picker
4. Select one → Menu appears

---

## Expected Behavior

### Smart Detection
- ✅ Detects .jsonl files in text editor
- ✅ Detects Claude Code chat tabs (fuzzy match)
- ✅ Falls back to conversation picker if needed

### Menu State
- ✅ Shows "Mark as Done" OR "Mark as Undone" (not both)
- ✅ Shows "Archive" OR "Restore" (based on state)
- ✅ All actions work correctly

### User Experience
- ✅ Menu opens instantly
- ✅ Icons make actions clear
- ✅ Details explain what each action does
- ✅ ESC cancels at any point

---

## Known Issues to Watch For

1. **Double menu:** If detection is ambiguous, user sees conversation picker first, THEN menu
   - This is expected behavior (fallback working)

2. **Tab reload required:** After rename, tab title won't update until chat is closed/reopened
   - This is documented limitation (Claude Code caching)

3. **Archive confirmation:** May show warning if conversation file is open
   - This is safety feature (existing behavior)

---

## Regression Testing

Make sure existing functionality still works:

### Tree View Actions (Should still work)
- ✅ Right-click → Rename
- ✅ Right-click → Toggle Done
- ✅ Right-click → Archive
- ✅ Right-click → Delete
- ✅ Inline buttons (edit, check, archive icons)

### Command Palette (Should still work)
- ✅ "Claude Code: Rename Current Conversation"
- ✅ "Claude Code: Archive Current Conversation"

### Settings
- ✅ Toggle `claudeChats.showStatusBarButton` off → button hides
- ✅ Toggle back on → button reappears

---

## Success Criteria

- ✅ Menu shows with correct options
- ✅ All 5 actions work correctly
- ✅ State-aware labels (done/undone, archive/restore)
- ✅ Smart detection works (80%+ direct menu)
- ✅ Fallback picker works when needed
- ✅ No regression in existing features
- ✅ Button visibility respects settings

---

## Next Steps After Testing

If everything works:
1. Update README with new menu feature
2. Update version to 0.5.1
3. Commit and publish

If issues found:
- Document the issue
- Fix before proceeding
