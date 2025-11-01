# Architecture Decision Log

This document tracks key technical decisions, trade-offs, and the reasoning behind architectural choices in the Claude Chats extension.

## Decision: Skip Message Count and Hidden Detection During Initial Load (2025-11-01)

### Context
The extension was reading and parsing entire conversation files (some with 800+ lines) during initial tree view load just to:
- Show message count in the description ("24 msgs •  2 hours ago")
- Detect if conversations are "hidden" (Claude Code cross-file references)

For a project with 100+ conversations, this meant parsing potentially 80,000+ lines on every load.

### Decision
**Skip `messageCount` and `isHidden` during initial tree load. Compute them lazily when the full file is actually parsed (viewer open, search, etc.).**

### Implementation
- `extractFastMetadataAsync()` now uses **rule-based parsing**: stops when it finds title (summary or first user message) + hasRealMessages flag
- Typical: 1-5 lines read per file (summary at line 1, first message at lines 2-5)
- `messageCount` made optional in `Conversation` interface - undefined until computed
- Tree view description doesn't show count if unavailable (just shows relative time)
- `isHidden` defaults to `false` (hidden conversations won't show eye-closed icon)

### Rationale

**Why skip messageCount:**
- Not essential for tree view navigation - users scan by title and time
- Computing it requires parsing entire file (every message needs counting)
- Nearly free to compute when we DO parse the full file (viewer, search)
- Better to optimize for initial load speed than show a rarely-used metric

**Why skip isHidden:**
- Hidden conversations are rare edge cases (Claude Code cross-file references)
- Detecting them requires reading entire file to check if leafUuid exists
- Not worth parsing 800+ lines per file to detect something most users never encounter
- False negatives are harmless - hidden conversations just show as normal

### Trade-offs

**Pros:**
- Dramatically faster initial load (reading 5 lines vs 800 per file = 160x reduction)
- Scales better with large conversation histories
- Still get all essential data (title, time, warmup status)

**Cons:**
- Message count not visible in tree view initially
- Hidden conversations show as normal (no eye-closed icon)
- Count computed on-demand means slight delay first time user opens a conversation

### Alternative Considered
**Lazy-load counts in background after initial tree render:** Rejected because:
- Added complexity with caching/invalidation logic
- Would cause tree items to "jump" as counts loaded
- Message count isn't important enough to warrant the engineering effort

### Future Considerations
- If users request message counts back, could add a "Load Counts" button or setting
- Could cache counts in workspace state after first full parse
- Could show "?" placeholder instead of hiding the count

---
