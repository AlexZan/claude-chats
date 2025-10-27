# Claude Code Conversation Display & Title Extraction - Research Findings

## Executive Summary

This document captures comprehensive findings from investigating how Claude Code determines which conversations to display and what titles to show, compared to our VS Code extension's behavior.

## Key Discoveries

### 1. Conversation Visibility in Claude Code

**Finding:** Claude Code scans the filesystem directly for `.jsonl` files, NOT solely relying on `~/.claude/history.jsonl`.

**Evidence:**
- Test conversations created without `history.jsonl` entries still appeared in Claude Code
- Removing entries from `history.jsonl` did NOT hide conversations from Claude Code's list
- `history.jsonl` appears to be used for quick resume/autocomplete, not as the primary registry

**Implication:** Our extension's approach of scanning filesystem is correct and matches Claude Code's behavior.

### 2. UUID Deduplication

**Finding:** Claude Code uses message UUIDs to deduplicate conversations. Files sharing message UUIDs are treated as the same conversation.

**Evidence:**
- Created multiple copies of a conversation file with only session IDs changed
- All copies with duplicate UUIDs appeared as ONE conversation in Claude Code
- Only when we generated completely new UUIDs for all messages did a separate conversation appear

**Test Results:**
```
File: 6c74811f (original)
- Showed as: "test"

File: aaaaaaaa (copy with same UUIDs, different session ID)
- Did NOT show as separate conversation
- When opened, added warmup messages to the SAME conversation

File: bbbbbbbb (copy with same UUIDs, different content)
- Did NOT show as separate conversation

File: ab06c5bd (copy with NEW UUIDs generated for all messages)
- Showed as separate conversation: "completely unique message with new UUIDs"
```

**Implication:** Our extension shows all files individually, which provides more visibility than Claude Code (useful for debugging/broken chats).

### 3. Content Format Requirements

**Finding:** Claude Code may have issues displaying conversations where user messages use string format instead of array format for content.

**Evidence:**
- File 87d2218d originally had: `"content": "text here"` (string format)
- After converting to: `"content": [{"type": "text", "text": "text here"}]` (array format), behavior changed
- All successfully displayed conversations used array format

**Formats Found:**
```javascript
// String format (possibly problematic for Claude Code UI)
"message": {
  "role": "user",
  "content": "do you see the permissions skill i have"
}

// Array format (preferred)
"message": {
  "role": "user",
  "content": [{"type": "text", "text": "do you see the permissions skill i have"}]
}
```

**Note:** Research documentation states both formats are valid, but Claude Code's UI may have a bug handling string format.

### 4. Case-Sensitive Path Matching

**Finding:** The `cwd` field is case-sensitive and must match the project directory encoding.

**Evidence:**
- File 87d2218d had: `"cwd": "D:\\Dev\\TaskTick"` (capital D)
- Project directory: `d--Dev-TaskTick` (lowercase d)
- Working files had: `"cwd": "d:\\Dev\\TaskTick"` (lowercase d)
- After fixing capitalization, behavior changed

**Implication:** Files with mismatched `cwd` capitalization may be filtered or grouped differently by Claude Code.

### 5. Conversation Branching & Cross-File References

**CRITICAL FINDING:** The `leafUuid` mechanism (documented in research) can point across session files, not just within the same file.

**Background from Research:**
The research documentation states:
> "Summary messages provide human-readable conversation titles and branch tracking. The leafUuid points to the active branch's final message, enabling conversation tree navigation."

**Our Discovery - Cross-File Extension:**
While the research documents `leafUuid` for conversation tree navigation, it doesn't explicitly state that `leafUuid` can point to messages in a **different session file**. This cross-file behavior is what causes title mismatches.

**How It Works:**
1. Conversation starts in one session file (e.g., `97409d9f`)
2. A summary message is created with title and `leafUuid`
3. Conversation continues/forks into a different session file (e.g., `87d2218d`)
4. The `leafUuid` points to a message UUID in the second file (cross-file reference)
5. Claude Code follows the `leafUuid` across files to determine which file contains the active conversation
6. Claude Code displays the summary title from the FIRST file, but opens the SECOND file

**Real Example:**
```
File: 97409d9f-f20d-464b-812a-6e0ef945918c.jsonl
- Contains summary: {
    "type": "summary",
    "summary": "Permissions Skill Not Discovered System Registration Issue",
    "leafUuid": "aa327e0e-d759-4b56-9822-8ad6b1bef00b"
  }

File: 87d2218d-91ed-4310-9f98-43559b89491d.jsonl
- Contains message with uuid: "aa327e0e-d759-4b56-9822-8ad6b1bef00b"
- First user message: "do you see the permissions skill i have"

Claude Code Display:
- Title: "Permissions Skill Not Discovered System Registration Issue" (from 97409d9f summary)
- Opens: 87d2218d file when clicked
- Hiding 97409d9f: Makes the conversation disappear OR show with different title
- Hiding 87d2218d: Makes the conversation disappear
```

**Test Results:**
- Hiding file 87d2218d → "Permissions Skill..." conversation disappeared
- Hiding file 97409d9f → "Permissions Skill..." conversation disappeared
- Hiding 97409d9f → File 87d2218d became visible as "do you see the permissions skill i have"
- Both files needed for the cross-referenced display

**Implication:** Our extension needs to check OTHER session files for summary messages with `leafUuid` pointing to the current file's messages.

## Title Extraction Priority (Current Implementation)

Our extension uses this priority order:

1. **Summary field** (from `type: "summary"` messages)
   - Skip warmup-related summaries (warmup|readiness|initialization|ready|assistant ready|codebase|exploration|introduction|search|repository)

2. **First non-sidechain user message**
   - `isSidechain: false` and `type: "user"`

3. **First non-sidechain message** (any type)
   - For conversations that start with assistant messages

4. **Sidechain assistant message** (warmup response)
   - For warmup-only conversations

5. **Last resort:** "Untitled"

## Title Extraction Priority (Claude Code Inferred Behavior)

Based on findings, Claude Code appears to use:

1. **Summary from ANY file with `leafUuid` pointing to this conversation**
   - Cross-file summary lookup via `leafUuid` → message UUID matching

2. **Summary in current file** (if exists and not warmup-related)

3. **First user message** (with array content format preferred)

4. **Fallback** (possibly first message or "Untitled")

## Implemented Changes in Our Extension

### ✅ Completed

1. **Cross-File Summary Lookup** - IMPLEMENTED
   - Extension now searches other files for summaries with `leafUuid` pointing to current conversation
   - Skips summaries that point to OTHER files (avoids showing wrong titles)
   - Successfully matches Claude Code's title display

2. **Last Non-Sidechain Message Timestamp** - IMPLEMENTED
   - Scans backward from last message to find first non-sidechain message
   - Uses that timestamp for display and sorting
   - Ignores warmup/reconnection messages after real conversation ends
   - Matches Claude Code's "6d ago" vs "12h ago" behavior

3. **Time-Based Grouping** - IMPLEMENTED
   - Groups conversations by: Today, Yesterday, Past week, Past month, Older
   - Sorts newest-first within each group
   - Matches Claude Code's organization

4. **Warmup Conversation Filter** - IMPLEMENTED
   - Added toggle button to show/hide warmup-only conversations
   - Hidden by default (matches Claude Code's clean list)
   - Can be enabled to view and delete unused warmup sessions

5. **Skip Warmup Messages in Title Extraction** - IMPLEMENTED
   - Skips messages that are exactly "Warmup" when finding title
   - Uses first real user message instead

### Recommended Future Enhancements

1. **Add Warning for Potential Issues**
   - Flag conversations with string content format (may not display in Claude Code)
   - Flag conversations with mismatched `cwd` capitalization
   - Flag conversations with duplicate message UUIDs

2. **Add Conversation Relationship Visualization**
   - Show when conversations are linked via leafUuid
   - Display parent/child relationships across session files
   - Visual indicator for cross-file summaries

## Technical Details

### File Structure
```
~/.claude/
├── history.jsonl              # Quick resume index (NOT primary registry)
├── settings.json              # User settings
├── projects/
│   ├── d--Dev-TaskTick/       # Project directory (encoded path)
│   │   ├── {uuid}.jsonl       # Session conversation files
│   │   ├── {uuid}.jsonl
│   │   └── ...
│   └── _archive/              # Archived conversations
└── ...
```

### Message UUID Relationships
```javascript
// Message with UUID
{
  "uuid": "aa327e0e-d759-4b56-9822-8ad6b1bef00b",
  "parentUuid": "previous-message-uuid",  // Links to parent message
  "isSidechain": false,
  "sessionId": "87d2218d-91ed-4310-9f98-43559b89491d",
  ...
}

// Summary message (in different file!)
{
  "type": "summary",
  "summary": "Conversation Title Here",
  "leafUuid": "aa327e0e-d759-4b56-9822-8ad6b1bef00b",  // Points to message above
  "parentUuid": null,
  "timestamp": "2025-10-21T07:25:00.000Z"
}
```

### Content Format Variations
```javascript
// Format 1: String (valid JSONL, possibly problematic for Claude Code UI)
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "text here"
  }
}

// Format 2: Array (preferred, confirmed working)
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {"type": "text", "text": "text here"}
    ]
  }
}
```

## Testing Methodology

### Test: UUID Deduplication
1. Created exact copy of conversation with different session ID
2. Verified separate file exists on filesystem
3. Checked Claude Code's conversation list
4. Result: Only one conversation shown (deduplication based on message UUIDs)

### Test: Cross-File Summary Lookup
1. Identified conversation showing title that doesn't exist in its file
2. Searched all project files for that title
3. Found summary in different file (97409d9f)
4. Extracted leafUuid from summary
5. Verified leafUuid matches message UUID in original file (87d2218d)
6. Hid each file separately to confirm both required for display

### Test: Content Format
1. Checked all successfully displayed conversations
2. All used array format for content
3. Converted string format to array format
4. Behavior changed (became visible)

### 6. Conversation Sorting & Timestamps

**CRITICAL FINDING:** Claude Code sorts conversations by the last **NON-SIDECHAIN** message timestamp, not by file modification time or the last message.

**Discovery Process:**
1. Noticed "What Skills are available?" showed 12h in our extension vs 6d in Claude Code
2. Investigated file `97409d9f-f20d-464b-812a-6e0ef945918c.jsonl`
3. Found line 51 was the last message displayed in Claude Code's chat
4. Lines 52-57 contained additional messages with more recent timestamps
5. All messages in lines 52-57 had `isSidechain: true` (warmup reconnections)

**Evidence:**
- Manually changed timestamp of last non-sidechain message in a conversation
- Order immediately changed in Claude Code to reflect new timestamp
- Confirms Claude Code uses last non-sidechain message for sorting

**How It Works:**

For **regular conversations:**
1. Scan backward from last message
2. Find first message where `isSidechain: false`
3. Use that message's timestamp for display and sorting
4. Ignore all sidechain warmup messages after it

For **cross-file summaries (API Errors, etc.):**
1. Use the `leafUuid` message timestamp (the "branch point")
2. This is usually older than the last activity
3. Represents when the conversation branch diverged

**Real Example:**
```javascript
// File: 97409d9f-f20d-464b-812a-6e0ef945918c.jsonl

// Line 51: Last non-sidechain message (Claude Code uses this timestamp)
{
  "type": "assistant",
  "message": { ... },
  "timestamp": "2025-10-21T07:27:01.559Z",  // 6d ago ✓
  "isSidechain": false
}

// Lines 52-57: Warmup messages (IGNORED by Claude Code)
{
  "type": "user",
  "message": { "content": "Warmup" },
  "timestamp": "2025-10-26T19:16:01.272Z",  // 12h ago ✗
  "isSidechain": true  // ← Key: This makes it ignored
}
```

**Time Grouping:**

Claude Code groups conversations into time periods:
- **Today** - Midnight today to now
- **Yesterday** - Midnight yesterday to midnight today
- **Past week** - 7 days ago to yesterday
- **Past month** - 30 days ago to past week
- **Older** - Everything before 30 days

Within each group, conversations are sorted **newest-first** (most recent activity at top).

**Implication:**
- Our extension was using file modification time or last message time
- This caused mismatches like "12h ago" vs "6d ago"
- Must filter out sidechain messages when determining conversation age
- For cross-file summaries, must use leafUuid message timestamp instead

### 7. Summary-Based Conversation Renaming

**MAJOR DISCOVERY:** Conversations can be renamed by adding or modifying the `summary` field in summary messages. This provides a cleaner rename mechanism than modifying the first user message content.

**Test Results (October 27, 2025):**

**Test 1: Modifying Existing Summary**
- File: `97409d9f-f20d-464b-812a-6e0ef945918c.jsonl`
- Original: `"summary":"Permissions Skill Not Discovered System Registration Issue"`
- Modified to: `"summary":"TEST RENAME VIA SUMMARY - 2025-10-27"`
- Result: ✅ Title changed immediately in Claude Code conversation list
- Persistence: ✅ Title remained after opening and using the conversation

**Test 2: Adding New Summary**
- File: `6c74811f-37b5-4359-a0a5-4a2429bd915f.jsonl`
- Original: No summary (would show "test" from first user message)
- Added: `{"type":"summary","summary":"NEW SUMMARY ADDED TEST - 2025-10-27","leafUuid":"43a65945-63dc-42c0-800d-08f57136ad4a"}`
- Result: ✅ New title appeared immediately in Claude Code conversation list
- Persistence: ✅ Title remained after opening and using the conversation

**How Summary-Based Renaming Works:**

1. **Summary Structure:**
```json
{
  "type": "summary",
  "summary": "Your Custom Title Here",
  "leafUuid": "uuid-of-last-non-sidechain-message"
}
```

2. **Placement:** Summary should be placed at the beginning of the `.jsonl` file (line 1)

3. **leafUuid:** Must point to the UUID of the last non-sidechain message in the conversation
   - Can point to messages in the same file OR in a different file (cross-file summary)
   - Claude Code uses this to determine which conversation the summary belongs to

4. **Priority:** Summary takes precedence over first user message content for title display

**Advantages Over Message Content Modification:**

✅ **Non-invasive** - Doesn't modify actual conversation content
✅ **Cleaner** - Dedicated field for titles vs. modifying user messages
✅ **Persistent** - Claude Code doesn't regenerate or overwrite custom summaries
✅ **Flexible** - Can add summaries to conversations that don't have them
✅ **Safe** - Doesn't affect conversation history or context

**Implementation for Rename Feature:**

When implementing conversation renaming:
1. Extract last non-sidechain message UUID from conversation
2. Check if summary already exists (look for `"type":"summary"` lines)
3. If exists: Modify the existing summary's `summary` field
4. If not exists: Add new summary line at beginning of file with proper leafUuid
5. Reload is not required - Claude Code picks up changes immediately

**Recommendation:**

This is the **preferred method** for implementing conversation renaming in our extension. It's cleaner, safer, and more aligned with Claude Code's internal structure than modifying first user message content.

### 8. Failed/Legacy Rename Approaches

Before discovering summary-based renaming, we explored several approaches that either failed or had significant drawbacks. Documented here to prevent repeating these mistakes.

**❌ FAILED: Orphaned Message Insertion**

Early attempts tried inserting new messages with `parentUuid: null` (orphaned messages) to change the title.

**Why it failed:**
- Claude Code conversation files use a tree structure where each message links to its parent via `parentUuid`
- Inserting orphaned messages (`parentUuid: null`) in the middle of a conversation breaks the chain
- VS Code loses track of conversation structure, resulting in:
  - "No prompt" ghost entries in conversation list
  - Conversations disappearing from the list
  - Duplicate conversation entries
  - Broken conversation tree display

**Example of broken structure:**
```json
{"uuid": "a", "parentUuid": null, "isSidechain": true}        // Warmup (OK)
{"uuid": "b", "parentUuid": "a"}                              // Assistant warmup
{"uuid": "c", "parentUuid": "b", "content": "Original msg"}   // First user message
{"uuid": "d", "parentUuid": null, "content": "New Title"}     // ❌ ORPHANED - Breaks VS Code
```

**⚠️ LEGACY: First User Message Modification**

The working fallback approach before summary discovery was to modify the first non-sidechain user message content directly.

**How it works:**
```python
# Find first non-sidechain user message
if data.get('type') == 'user' and data.get('isSidechain') == False:
    data['message']['content'] = new_title  # Replace content
    # Keep all UUIDs and parentUuid intact
```

**Pros:**
- Works reliably - no VS Code confusion
- Simple implementation
- No UUID generation or chain updates needed

**Cons:**
- ❌ **Loses original first message content**
- User can't see what they originally asked
- Conversation context is lost
- Not ideal for long, detailed first messages

**Status:** This approach is now considered legacy. Use summary-based renaming instead, which preserves all conversation content while still allowing custom titles.

## Open Questions

1. **Why do conversations fork into separate session files?**
   - User manually continuing conversation?
   - Fork/branch functionality?
   - Session recovery/resume creating new file?

2. **How does Claude Code decide which summary to use when multiple exist?**
   - Most recent by timestamp?
   - Longest leafUuid chain?
   - First found?

3. **What other scenarios create cross-file references?**
   - Context compaction?
   - Agent tool usage?
   - Checkpoint/rewind feature?

4. **Is string content format truly problematic or just coincidental?**
   - Need more test cases
   - May be version-specific bug
   - Research docs say both valid

## Version Information

- Claude Code Version: 2.0.27 (tested)
- Extension Test Date: October 26-27, 2025
- Research Sources:
  - `research/claudejsonlfromat.md`
  - `research/Claude Code Conversation Logs (.jsonl) – Format and Usage.pdf`
  - Direct filesystem analysis
  - Live testing with Claude Code UI

## Files Referenced

- `87d2218d-91ed-4310-9f98-43559b89491d.jsonl` - Test case for cross-file summary
- `97409d9f-f20d-464b-812a-6e0ef945918c.jsonl` - Contains summary for 87d2218d; used for summary modification test
- `6c74811f-37b5-4359-a0a5-4a2429bd915f.jsonl` - Used for adding new summary test
- Various test copies created during investigation

## Conclusion

The most significant findings are:

1. **Summary-Based Renaming (NEW):** Conversations can be reliably renamed by adding/modifying summary messages. This is the **recommended approach** for implementing conversation renaming - it's cleaner, safer, and more persistent than modifying user message content.

2. **Cross-File Summary Mechanism:** The `leafUuid` mechanism allows summaries to reference messages across different session files. This is crucial for proper title extraction in conversations that span multiple files.

3. **Non-Sidechain Timestamp Filtering:** Claude Code uses the last non-sidechain message timestamp for sorting, ignoring warmup/reconnection messages that occur after the conversation ends.

These discoveries enable our extension to provide accurate conversation display matching Claude Code's behavior, while also offering a robust rename feature that Anthropic hasn't yet implemented natively.
