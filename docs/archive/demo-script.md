# Claude Chats - Demo GIF Script

This script outlines the steps for creating animated GIF demos of Claude Chats for the VS Code marketplace and README.

## Setup

**Duration Target**: 5-8 seconds per GIF (keep them short and focused)
**Recording Tool**: Windows 11 Snipping Tool (Win + Shift + S → Record tab)
**Output**: Save directly as GIF from Snipping Tool
**Window Selection**: Free-hand rectangle around the relevant VS Code area

## Strategy: 3 Focused Mini-GIFs

Since you can't set exact window sizes and must free-hand draw, create **3 short, focused GIFs** that showcase key features. This avoids flooding the README while showing all important functionality.

### Rectangle Drawing Tips
1. **Practice the area first** - hover your mouse to visualize the rectangle
2. **Include padding** - Leave ~20px around the edges
3. **Keep consistent** - Try to draw similar-sized rectangles for all 3 GIFs
4. **Focus on sidebar** - Capture Claude Chats panel + small editor area for context

## Pre-Recording Checklist

- [ ] Close unnecessary VS Code panels (terminal, output, etc.)
- [ ] Set VS Code theme to a popular one (Dark+ or similar)
- [ ] Ensure 8-12 Claude Code conversations exist
- [ ] Have at least 1 conversation archived
- [ ] Clear any personal/sensitive information from conversation titles
- [ ] Set zoom level for readability (Ctrl/Cmd + = a few times)
- [ ] Position Claude Chats view prominently in sidebar

---

## GIF #1: Search & Rename (6-8 seconds)
**Filename**: `demo-search-rename.gif`
**Shows**: Core functionality - search and true file renaming

### Recording Steps:
1. **Draw rectangle** around: Claude Chats sidebar (full height, ~400px width)
2. **Start recording**
3. **Action sequence**:
   - Pause 1 second with cursor hovering over search icon
   - Click search icon
   - Type: "bug fix" (or relevant term)
   - Show 2-3 filtered results (pause 1 second)
   - Clear search (X button or backspace)
   - Right-click a conversation → "Rename Conversation"
   - Type new name: "Authentication Bug Fix 🐛"
   - Press Enter
   - Hover over renamed item briefly to highlight it
4. **Stop recording**
5. **Trim** in Snipping Tool if needed
6. **Save as GIF**

**What it demonstrates**: Fast search + instant rename (key differentiators)

---

## GIF #2: Archive & Restore (5-7 seconds)
**Filename**: `demo-archive.gif`
**Shows**: Organization features

### Recording Steps:
1. **Draw rectangle** around: Claude Chats sidebar (full height)
2. **Start recording**
3. **Action sequence**:
   - Pause 0.5 seconds
   - Right-click a conversation → "Archive Conversation"
   - Watch it move to "Archived Conversations" section
   - Pause 1 second to show archived state
   - Expand "Archived Conversations" if not visible
   - Right-click archived item → "Restore from Archive"
   - Watch it return to main list
   - Hover over restored item briefly
4. **Stop recording**
5. **Trim** and **save as GIF**

**What it demonstrates**: Archive management workflow

---

## GIF #3: View Conversation (4-6 seconds)
**Filename**: `demo-viewer.gif`
**Shows**: Custom viewer with syntax highlighting

### Recording Steps:
1. **Draw rectangle** around: Sidebar + editor area (wider rectangle, ~800px)
2. **Start recording**
3. **Action sequence**:
   - Click on a conversation with code in it
   - Wait for viewer to open
   - Scroll down slowly through conversation
   - Show code blocks with syntax highlighting
   - Pause briefly on a colorful code section
4. **Stop recording**
5. **Trim** and **save as GIF**

**What it demonstrates**: Beautiful formatted viewer

---

## Alternative: Single Combined GIF (If You Want Just One)

If you prefer ONE comprehensive GIF instead of three:

### GIF: Quick Feature Tour (10-12 seconds)
**Filename**: `demo-features.gif`

1. **Draw rectangle** around: Claude Chats sidebar only (narrow, ~400px)
2. **Action sequence**:
   - Show conversation list (1s)
   - Click search → type → show results (2s)
   - Clear search (0.5s)
   - Right-click → rename conversation (2s)
   - Right-click → archive (1.5s)
   - Show archived section (0.5s)
   - Right-click → restore (1.5s)
   - Final hover over list (1s)

**This combines search, rename, and archive in one flowing demo** - good for marketplace hero image.

## Recording Tips for Windows 11 Snipping Tool

1. **Practice the rectangle**: Hover and visualize before drawing
2. **Consistent size**: Try to draw similar rectangles for all 3 GIFs
3. **Include padding**: Leave ~20px margins around content
4. **Practice actions**: Do 2-3 dry runs before recording
5. **Slow and steady**: Deliberate cursor movements
6. **Pause at results**: Give viewers time to see changes
7. **No mistakes**: Re-record if you misclick - these are SHORT so it's quick

### Snipping Tool Workflow

```
Win + Shift + S
→ Click "Record" tab
→ Click "New"
→ Draw rectangle around capture area
→ Click "Start" button
→ Perform your demo actions
→ Click "Stop" button
→ Use trim tool to cut dead time
→ Click "Save as" → Choose GIF format
```

## File Naming & Organization

Save your GIFs as:
- `demo-search-rename.gif` (GIF #1)
- `demo-archive.gif` (GIF #2)
- `demo-viewer.gif` (GIF #3)
- OR `demo-features.gif` (single combined version)

**Target file size**: Under 3MB each (Snipping Tool optimizes automatically)

---

## How to Use in README.md

### Option A: 3 Focused GIFs (Recommended)

```markdown
## Features

### 🔍 Lightning-Fast Search
![Search and Rename Demo](demo-search-rename.gif)

Search across all conversations instantly and rename them with true file modification.

### 📦 Archive Management
![Archive Demo](demo-archive.gif)

Keep your workspace organized by archiving old conversations and restoring them when needed.

### 👁️ Beautiful Viewer
![Viewer Demo](demo-viewer.gif)

View conversations with syntax-highlighted code blocks in a clean, readable format.
```

### Option B: Single Hero GIF

```markdown
## Features

![Claude Chats Features](demo-features.gif)

- 🔍 **Fast Search** - Find any conversation instantly
- ✏️ **True Rename** - Modify actual .jsonl files
- 📦 **Archive** - Organize your conversation history
- ⚡ **Lightning Fast** - Faster than native Claude Code
```

**Recommendation**: Use **Option A (3 GIFs)** - it's more engaging and doesn't flood the README since each GIF is focused and short.

---

## Merging Multiple GIFs (If Needed)

If you want to combine the 3 GIFs into one later, you can use:

**Online Tools**:
- **ezgif.com/maker** - Upload multiple GIFs, set delays, merge
- **gifmaker.me** - Combine GIFs vertically or horizontally

**Command Line** (if you have ffmpeg):
```bash
# Stack vertically
ffmpeg -i demo-search-rename.gif -i demo-archive.gif -i demo-viewer.gif -filter_complex vstack=inputs=3 combined.gif

# Stack horizontally (if they're similar height)
ffmpeg -i demo-search-rename.gif -i demo-archive.gif -filter_complex hstack combined.gif
```

**Note**: For README, keeping them separate is better for loading and readability.

---

## Quality Checklist

Before using in README, verify each GIF:
- [ ] All text is readable at normal size
- [ ] No personal/sensitive information visible
- [ ] GIF loops smoothly without jarring jump
- [ ] File size under 3MB each
- [ ] Demonstrates clear value proposition
- [ ] No UI glitches or errors visible
- [ ] Cursor movements are smooth and purposeful
- [ ] Key moments have adequate pause time (1+ seconds)
- [ ] Colors/contrast are clear
- [ ] Rectangle capture is consistent across all GIFs

---

## Quick Reference

**Best approach for your use case**:
1. ✅ Record **3 separate short GIFs** (6-8 seconds each)
2. ✅ Use **Windows 11 Snipping Tool** with free-hand rectangle
3. ✅ Save directly as GIF format
4. ✅ Place in README using **Option A layout** (one per feature section)
5. ✅ Keep them separate - don't merge unless necessary

**Total recording time**: ~15-20 minutes including practice runs and retakes
