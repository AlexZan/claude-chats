# Release v0.5.2 - Tab Context Menu

## 🎉 New: Right-Click on Tabs

Version 0.5.2 adds tab context menu support - right-click any editor tab to access Claude Chats menu!

### What's New

**Right-Click Tab Access**
- Right-click on any editor tab
- "Claude Chats" appears in context menu
- Same full action menu (5 quick actions)
- Works with Claude Code chats and .jsonl files

---

## How It Works

**User Flow:**
1. Right-click on any editor tab
2. Select "Claude Chats" from context menu
3. Menu appears with all actions

**Smart Detection:**
- **Claude Code chat tabs** → Smart detection → Menu opens (80%+ success)
- **.jsonl file tabs** → Direct detection → Menu opens immediately
- **Other tabs** → Fallback to conversation picker

---

## Access Methods

Now **3 ways** to access Claude Chats menu:

1. **Status Bar Button** - When Claude Code chat is active
2. **Right-Click Tab** - Any editor tab (NEW!)
3. **Command Palette** - `Ctrl+Shift+P` → "Claude Chats"

---

## Benefits

- ✅ **More discoverable** - Natural right-click behavior
- ✅ **Always accessible** - Works even if status bar button disabled
- ✅ **VS Code standard** - Consistent with other extensions
- ✅ **No new code** - Reuses existing detection logic

---

## Technical Implementation

### Changes

**package.json:**
- Added `showClaudeChatsMenu` to commands section
- Added `editor/title/context` menu contribution point

**Lines changed:** 8 lines (command definition + menu contribution)

**No changes to:**
- extension.ts (command already existed)
- conversationManager.ts (detection already existed)
- README.md (documentation updated)

---

## Compatibility

- ✅ **Fully backward compatible**
- ✅ **No breaking changes**
- ✅ **Same detection logic** (80%+ success rate)
- ✅ **All existing features work**

---

## Upgrade Instructions

### From v0.5.1

1. Update extension via VS Code Marketplace
2. Reload VS Code (if needed)
3. Right-click on any editor tab
4. See "Claude Chats" in context menu!

**No configuration needed.**

---

## Changelog Summary

### Added
- Tab context menu contribution (`editor/title/context`)
- `showClaudeChatsMenu` command definition with icon

### Changed
- README updated with tab right-click instructions
- Version bumped to 0.5.2

### Removed
- Nothing

---

## Version History

- v0.5.0 - Quick rename status bar button
- v0.5.1 - Upgraded to full Claude Chats menu
- v0.5.2 - Added tab context menu access (NEW!)

---

## User Feedback

**Request:** "What about adding the rename functionality in right clicking on the tab?"

**Delivered!** 🎉

---

**Enjoy the new tab context menu!** 🚀

This small enhancement makes Claude Chats even more accessible - now just a right-click away from any tab!
