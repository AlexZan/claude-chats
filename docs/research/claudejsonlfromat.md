# Claude Code JSONL Chat History Format: Complete Technical Specification

**Claude Code's JSONL chat history format is officially documented but not comprehensively detailed.** Anthropic provides the core TypeScript schema in their SDK documentation, while the community has reverse-engineered practical implementation details through extensive tooling development. The format uses standard JSONL (JSON Lines) with one complete JSON object per line, storing conversations in `~/.claude/projects/` with sophisticated message threading and full context preservation.

The format is production-ready and maintained under semantic versioning, though it lacks standalone specification documentation. This creates a gap filled by an active community ecosystem that has built 15+ parsing tools, type-safe libraries, and visualization platforms. Understanding both the official schema and real-world implementation patterns is essential for reliable programmatic access.

## Official documentation and schema definition

Anthropic officially documents the JSONL format in their SDK documentation at docs.anthropic.com/en/docs/claude-code/sdk under "Streaming JSON output." The specification provides a complete TypeScript union type defining all message structures but omits detailed field descriptions and edge cases. The format commitment is clear: **"We use semantic versioning for the main Claude Code package to communicate breaking changes to this format."**

The official TypeScript schema defines five primary message types through the `SDKMessage` union. User messages contain prompts and tool results with the structure `{type: "user", message: APIUserMessage, session_id: string}`. Assistant messages include responses, tool uses, thinking blocks, and usage statistics as `{type: "assistant", message: APIAssistantMessage, session_id: string}`. System initialization messages provide session context with tools, models, and permissions. Result messages deliver final session statistics including costs, token usage, and turn counts with subtypes for success, max_turns_reached, and execution_errors. Summary messages enable context compaction by storing conversation titles and leaf node references.

The schema references Anthropic SDK types directly. The `Message` and `MessageParam` types come from `@anthropic-ai/sdk` (TypeScript) or the `anthropic` package (Python), ensuring consistency with Anthropic's API contracts. This design choice means Claude Code's JSONL format directly mirrors the structure of API messages, making programmatic access straightforward for developers already familiar with Anthropic's SDKs.

## Storage architecture and file organization

Claude Code stores all conversations locally in `~/.claude/projects/` with a specific encoding scheme for project paths. The system transforms absolute directory paths into storage keys by replacing all forward slashes with hyphens. A project at `/home/user/projects/myapp` becomes `-home-user-projects-myapp`, and `/Users/bob/work/client-site` becomes `-Users-bob-work-client-site`. Each project directory contains session files named with UUIDs: `{project-encoded-path}/{session-uuid}.jsonl`.

A companion file at `~/.claude/history.jsonl` maintains a session index with metadata including session IDs, working directories, timestamps, and first message previews. This index enables the CLI's session resume functionality and provides a catalog of all conversations without parsing complete session files. The architecture is entirely local-first with no cloud storage, giving users complete control over conversation data but requiring manual backup and synchronization.

Session files follow strict JSONL conventions: each line contains exactly one complete, independently parseable JSON object terminated by a newline character. Files use UTF-8 encoding without BOM, and parsing must handle both Unix (LF) and Windows (CRLF) line endings. Messages are always appended sequentially, creating an append-only log that preserves complete conversation history without in-place modifications. This immutable design enables simple file watching, streaming parsers, and incremental processing.

## Complete message structure and field definitions

Every message in Claude Code's JSONL format shares a common base structure with contextual metadata. The **parentUuid field** creates conversation threading by referencing the UUID of the previous message, forming directed acyclic graphs that support conversation branching. Root messages have `parentUuid: null`. The **isSidechain boolean** distinguishes main conversation threads from parallel branches created during context compaction or alternative exploration paths.

Session context fields provide environmental information at each message. The **cwd field** stores the absolute working directory path when the message was created, tracking project location changes across sessions. The **sessionId UUID** groups related messages into conversations, matching the filename in `~/.claude/projects/`. The **version field** records the Claude Code release (e.g., "2.0.17"), enabling format migration detection. The **gitBranch field** captures the active Git branch when applicable, supporting workflow context. Every message includes an **ISO 8601 timestamp** like "2025-10-16T14:00:03.919Z" for chronological ordering.

User messages represent human input with the structure: `{type: "user", message: {role: "user", content: string | ContentBlock[]}, uuid: string, timestamp: string}`. Simple text messages have string content, while tool result messages contain arrays of `{type: "tool_result", tool_use_id: string, content: string, is_error: boolean}` objects. Special meta messages with `isMeta: true` provide system-generated context like "The messages below were generated by the user while running local commands."

Assistant messages contain Claude's responses with comprehensive execution metadata. The message field follows Anthropic's API format with `{id: "msg_01...", type: "message", role: "assistant", content: ContentBlock[], stop_reason: string, stop_sequence: string | null, usage: Usage}`. Content blocks are arrays supporting text (`{type: "text", text: string}`), tool uses (`{type: "tool_use", id: string, name: string, input: object}`), and thinking blocks (`{type: "thinking", thinking: string}`). The usage object breaks down tokens: `{input_tokens: int, output_tokens: int, cache_creation_input_tokens: int, cache_read_input_tokens: int}`.

Cost and performance metrics appear in assistant messages when available. The **costUSD field** provides the monetary cost of the API call, though this field has been removed in versions after 1.0.9 for users on subscription plans. The **durationMs field** records response latency in milliseconds. The **requestId field** stores Anthropic's API request identifier for debugging. The **model field** in message.model identifies which Claude variant processed the request (e.g., "claude-sonnet-4-20250514").

## Tool execution representation

Claude Code uses a request-response pattern for tool execution spanning multiple JSONL lines. Assistant messages initiate tool calls with content blocks: `{type: "tool_use", id: "toolu_01ABC123", name: "Write", input: {file_path: "/path/to/file.txt", content: "..."}}`. The tool_use_id uniquely identifies the operation and links to subsequent results. Built-in tools include Agent (subagent launching), Bash (command execution), Read/Write/Edit (file operations), Glob/Grep (search), WebFetch/WebSearch (internet access), and MCP tools for external integrations.

Tool results appear in subsequent user messages with the structure: `{type: "user", message: {role: "user", content: [{type: "tool_result", tool_use_id: "toolu_01ABC123", content: "File created successfully", is_error: false}]}}`. The content field contains execution output as a string, and is_error indicates whether the tool encountered failures. This two-message pattern enables clear separation between Claude's intent and actual execution outcomes, supporting retry logic and error handling.

Advanced tool results include structured metadata in the **toolUseResult field** for operations affecting project state. File writes include old and new todo lists extracted from comments, enabling task tracking across edits. Bash commands preserve working directories and process IDs for long-running operations. The parent_tool_use_id field connects tool results to their originating requests across message boundaries, supporting complex multi-step tool chains.

## System messages and session lifecycle

Every conversation begins with an initialization message providing complete session context: `{type: "system", subtype: "init", session_id: string, cwd: string, tools: string[], mcp_servers: array, model: string, permissionMode: string, slash_commands: string[], apiKeySource: string, output_style: string, uuid: string, timestamp: string}`. The tools array lists all available operations, typically 15-20 built-in tools. The mcp_servers array describes connected Model Context Protocol servers with `{name: string, status: "connected" | "error"}` objects. The permissionMode indicates security settings (default, strict, or dangerous).

Sessions terminate with result messages summarizing outcomes and resource consumption: `{type: "result", subtype: "success" | "error_during_execution" | "error_max_turns", session_id: string, cost_usd: float, num_turns: int, usage: Usage}`. Success results include duration_ms, duration_api_ms, and a result string with task outcomes. Error results provide error messages and partial statistics. The num_turns field counts complete request-response cycles, while total_cost_usd aggregates all API charges.

Context compaction creates compact_boundary system messages when conversation history exceeds token limits: `{type: "system", subtype: "compact_boundary", uuid: string, session_id: string, compact_metadata: {trigger: "manual" | "auto", pre_tokens: int}}`. These markers indicate where Claude Code performed summarization, replacing detailed history with condensed summaries while preserving semantic content. The pre_tokens field records conversation size before compaction, enabling cost analysis of context management.

Summary messages provide human-readable conversation titles and branch tracking: `{type: "summary", summary: "Conversation Title", leafUuid: "last-message-uuid", timestamp: string}`. The summary field contains AI-generated or user-provided titles appearing in UI lists. The leafUuid points to the active branch's final message, enabling conversation tree navigation. Multiple summaries may exist per file as conversations evolve and branch.

## Conversation threading and branching architecture

Message relationships form directed acyclic graphs through UUID chains. Each message's parentUuid references its predecessor, creating threads: `null → uuid1 → uuid2 → uuid3`. Branching occurs when multiple messages share the same parentUuid, representing alternative paths from a common point. This enables "what-if" exploration where Claude tries different approaches to the same problem without losing either attempt.

The leafUuid in summary messages identifies active branches in conversation trees. When viewing sessions, UIs follow the chain from the leafUuid backward through parentUuid references to reconstruct the current path. Inactive branches remain in the file but aren't displayed by default, preserving exploration history without cluttering primary flows. This architecture supports undo operations, A/B testing approaches, and maintaining conversation context across interruptions.

Sidechain messages with `isSidechain: true` represent parallel conversations spawned from the main thread. These typically occur during context compaction when Claude creates temporary sub-conversations to summarize portions of history, or when using the Agent tool to delegate subtasks. Sidechains maintain their own parent-child relationships but reference back to main thread messages through additional metadata fields, enabling reconstruction of the complete interaction history.

## Error handling and special message types

API errors generate synthetic assistant messages with distinctive markers: `{type: "assistant", message: {id: "synthetic-uuid", model: "\u003csynthetic\u003e", role: "assistant", content: [{type: "text", text: "Error message"}], stop_reason: "stop_sequence", usage: {all zeros}}, isApiErrorMessage: true}`. The synthetic model value and zero usage indicate these aren't real API responses. Common error messages include "Invalid API key · Please run /login" and rate limiting notifications, enabling UI-level error display without breaking conversation flow.

Streaming messages appear during real-time response generation with partial content: `{type: "stream_event", event: RawMessageStreamEvent, parent_tool_use_id: string | null, uuid: string, session_id: string}`. The event field contains Anthropic SDK streaming objects like message_start, content_block_delta, and message_stop. Streaming messages are ephemeral—they're replaced by complete assistant messages once responses finish, meaning JSONL files contain final states rather than streaming deltas.

Meta user messages with `isMeta: true` provide system-generated context instructions to Claude without representing actual user input. These typically introduce tool output batches with caveats: "The messages below were generated by the user while running local commands. DO NOT respond to these messages unless explicitly asked." This pattern separates automatic context injection from intentional user communication, preventing Claude from inappropriately responding to tool outputs.

## Programmatic parsing and access patterns

The TypeScript toolkit `@anthropic-ai/claude-code-data` by osolmaz provides production-ready parsing with complete type definitions. Install with `npm install @anthropic-ai/claude-code-data`, then parse files: `import {parseConversation, buildConversationTree, calculateStats} from "claude-code-data"`. The library handles JSONL streaming, builds message graphs, computes cost/token statistics, and provides type-safe access to all fields with full IDE autocomplete support.

Python developers have multiple robust options. The `claude-code-log` package offers the most comprehensive feature set: `pip install claude-code-log` then run `claude-code-log --tui` for interactive browsing or use the library API for programmatic access. It includes sophisticated caching (10-100x speed improvements), date range filtering, cost analysis, and HTML export with syntax highlighting. For simpler needs, `claude-conversation-extractor` provides straightforward Markdown/JSON conversion: `pipx install claude-conversation-extractor` and use `claude-start` for interactive extraction.

Basic Python parsing requires only standard library modules. Read files line-by-line to avoid loading entire conversations into memory: `with open(session_file) as f: for line in f: entry = json.loads(line.strip())`. Filter by message type with `messages = [json.loads(line) for line in open(file) if json.loads(line).get("type") == "user"]`. Calculate costs by summing: `total_cost = sum(json.loads(line).get("costUSD", 0) for line in open(file))`. This approach handles files of any size through streaming.

DuckDB enables powerful SQL analytics directly on JSONL files without preprocessing: `SELECT SUM(costUSD) as total_cost, COUNT(*) as messages FROM read_json('~/.claude/projects/*/*.jsonl') WHERE type='assistant'`. Query across all sessions: `SELECT regexp_replace(cwd, '^.*/', '') as project, SUM(message.usage.input_tokens) as tokens FROM read_json('~/.claude/projects/*/*.jsonl') GROUP BY project`. DuckDB's JSON support automatically handles nested structures, making it ideal for ad-hoc cost analysis and usage reporting.

## Known issues and edge cases requiring special handling

**Duplicate entries in stream-json mode** (GitHub issue #5034) cause conversation history to be replicated with each new message when using `--input-format stream-json`. This creates exponential file growth and requires deduplication. Implement by tracking seen UUIDs: `seen = set(); unique = [msg for msg in messages if msg["uuid"] not in seen and not seen.add(msg["uuid"])]`. The issue remains open as of late 2024, so all parsers must handle duplicates defensively.

**Missing historical context on resume** (issue #5135) means `--resume` only streams new messages without replaying conversation history. External integrations must manually parse session JSONL files before connecting to get full context. No `--include-history` flag exists, forcing implementers to build session restoration logic independently. This affects tools that want to display complete conversations when reconnecting to ongoing sessions.

**Version compatibility across format evolution** requires parsers to handle optional fields gracefully. The costUSD field appeared in early versions but was removed around v1.0.9 for subscription plan users. The durationMs field is present in some but not all assistant messages. The gitBranch field only appears when projects use Git. Robust parsers check field existence with `msg.get("costUSD")` rather than assuming presence, and provide defaults when extracting statistics.

**Path encoding fragility** breaks `--continue` functionality when projects move or are renamed. The encoded path `-Users-bob-project` no longer matches if the directory moves to `/home/bob/project`. No automatic migration exists, requiring manual session file relocation. Community tools like the gwpl GitHub gist document workarounds: copy session files from old encoded paths to new ones and update cwd fields in all messages.

**Summary leafUuid references** occasionally point to non-existent message UUIDs after context compaction or manual history editing. Parsers must handle dangling references by scanning for the deepest message in available threads rather than failing on lookup errors. This occurs most frequently in long-running sessions with aggressive compaction where intermediate messages are removed but summaries retain old leafUuid values.

**Content structure variability** requires type checking before access. User message content may be a simple string or an array of content blocks. Assistant message content is always an array but may contain different block types (text, tool_use, thinking). Tool result content is always a string but may represent structured data as JSON. Parsers should use isinstance checks or pattern matching rather than assuming types.

## Best practices for production implementations

Implement streaming parsers for large session files to avoid memory exhaustion. Use Python's readline or Node's readline for line-by-line processing: `for await (const line of createInterface({input: createReadStream(path)})) { if (line.trim()) yield JSON.parse(line); }`. This pattern handles multi-gigabyte sessions without loading complete files, essential for long-running development sessions with thousands of messages.

Cache parsed results with file modification time tracking to avoid repeated parsing. Store processed conversations in SQLite or JSON with the JSONL file's mtime: `if cache_mtime \u003c file_mtime: reparse()`. The claude-code-log tool demonstrates this pattern with 10-100x performance improvements on repeated access. Clear caches when Claude Code versions change, as format modifications may require reprocessing.

Build conversation trees correctly by handling multiple children per parent. Use adjacency lists: `children = defaultdict(list); for msg in messages: children[msg["parentUuid"]].append(msg)`. Traverse depth-first from root messages where `parentUuid is None`. For active branch reconstruction, work backward from leafUuid through parentUuid chains. This bidirectional approach handles both full conversation export and active thread display.

Validate message structure with type checking before field access. Use TypeScript's discriminated unions or Python's TypedDict/Pydantic models. Check message.type first: `if msg["type"] == "assistant": process_assistant(msg["message"])`. For nested structures, verify field existence: `usage = msg.get("message", {}).get("usage", {})`. This defensive approach handles format variations across Claude Code versions without crashes.

Handle encoding edge cases by reading files with UTF-8 and replacing invalid sequences: `open(file, encoding="utf-8", errors="replace")`. Some tool outputs contain binary data or invalid Unicode that shouldn't crash parsers. Strip null bytes and control characters except newlines when processing tool results. Normalize line endings to `\n` before parsing to support cross-platform session file sharing.

## Community ecosystem and third-party tooling

The community has built 15+ production-ready tools filling gaps in official functionality. For quick Markdown export, **claude-conversation-extractor** provides `pipx install claude-conversation-extractor; claude-start` for interactive extraction with search capabilities. For comprehensive analysis, **claude-code-log** offers HTML conversion, cost tracking, and real-time monitoring with `pip install claude-code-log; claude-code-log --tui`. Desktop users benefit from **claude-code-history-viewer**, a Tauri-based app with activity heatmaps, token breakdowns, and auto-refresh.

Go developers have **cclog** (`go install github.com/annenpolka/cclog/cmd/cclog@latest`) providing TUI navigation, clipboard integration for session IDs, and clean Markdown output. JavaScript ecosystems use **claude-code-exporter** as an MCP server with aggregation across projects: `npm install -g claude-code-exporter; claude-prompts --aggregate --period=7d` exports recent activity. The **claude-code-data** TypeScript library provides type-safe parsing for integration into VS Code extensions and Node applications.

Web-based viewers enable browser access to local conversations. **claude-code-viewer** by d-kimuson runs a local server with real-time updates, schema validation via Zod, and session launching from the UI. **Data-Integrities/claude** adds AI-powered automatic summarization and full-text search with highlighting. These tools bridge the gap between technical JSONL files and accessible user interfaces without sending data to external services.

VS Code extensions like **Claude Code Assist - Chat History & Diff Viewer** integrate session browsing directly into the IDE. Install from marketplace and access via sidebar to view conversation history, file diffs, and token usage without leaving the editor. The extension polls `~/.claude/projects/` for updates and provides search across all sessions, making historical reference efficient during active development.

## Security and privacy considerations

JSONL files contain complete conversation content including code, prompts, API keys, credentials, and proprietary business logic. Files are stored world-readable by default on Unix systems, requiring explicit permission changes: `chmod 700 ~/.claude/projects/` restricts access to the owner. On shared development machines, consider encrypting the entire `.claude` directory or excluding it from synchronized folders like Dropbox.

API keys may appear in conversation history if accidentally pasted into prompts or captured in tool outputs. Before sharing session files for debugging, scan for sensitive patterns: `grep -r "sk-ant-api" ~/.claude/projects/` or `rg "(password|token|secret)" ~/.claude/`. Tools like git-secrets can detect common patterns, though manual review remains essential for comprehensive sanitization.

Backup strategies must balance durability with security. Cloud backups of `.claude/` expose conversations to provider access. Local backups on encrypted drives provide better security. Consider selective backup: preserve session files older than 30 days (after Claude Code's automatic deletion) but exclude recent active sessions. Archive to encrypted tar files: `tar -czf claude-backup.tar.gz -C ~ .claude/ && gpg -c claude-backup.tar.gz`.

Data retention policies should align with organizational requirements. Claude Code automatically deletes sessions older than 30 days from subscription users' storage. For compliance scenarios requiring longer retention, copy session files to archival storage before deletion. For right-to-be-forgotten requests, manually delete all sessions: `rm -rf ~/.claude/projects/` removes all local history.

## Format versioning and evolution patterns

Claude Code uses semantic versioning to signal format changes. **Major version bumps** (2.0.0) indicate breaking schema changes requiring parser updates. **Minor versions** (1.1.0) add optional fields that parsers can ignore. **Patch versions** (1.0.1) fix bugs without format modifications. Monitor the @anthropic-ai/claude-code package releases to anticipate parsing requirement changes.

Observable format evolution includes field additions and deprecations. The **costUSD field** was removed for subscription users around v1.0.9, replaced with aggregated billing. The **thinking content block type** was added in mid-2024 to expose Claude's extended thinking. The **mcp_servers array** expanded from simple names to structured objects with status fields. Parsers should treat all fields as optional except type, uuid, and message to maintain forward compatibility.

Migration strategies for breaking changes involve version detection: `if msg.get("version", "0.0.0") \u003c "2.0.0": legacy_parse() else: current_parse()`. Store format version separately from Claude Code version, as internal schema changes may not align with release numbers. Test parsers against session files from multiple Claude Code versions, maintaining backward compatibility for at least three major releases.

## Advanced use cases and integration patterns

**Cost analysis and budget enforcement** requires aggregating costUSD across sessions and date ranges. Query with DuckDB: `SELECT DATE_TRUNC('day', timestamp) as day, SUM(costUSD) as daily_cost FROM read_json('~/.claude/projects/*/*.jsonl') WHERE type='assistant' GROUP BY day ORDER BY day`. Set alerts when daily costs exceed thresholds, enabling proactive budget management for large development teams.

**Audit trails for compliance** leverage JSONL's append-only nature. Each message's timestamp and UUID provide immutable history of AI interactions. Export sessions to long-term storage with: `find ~/.claude/projects/ -name "*.jsonl" -exec cp {} /archive/{} \;`. Include metadata about tools used, files modified, and external resources accessed for comprehensive audit logs meeting SOC 2 or ISO 27001 requirements.

**Knowledge extraction and search** indexes conversation content for organizational knowledge bases. Parse all sessions to build inverted indexes mapping concepts to sessions: `{term: [session_ids]}`. Use Elasticsearch or Algolia for full-text search across historical conversations. Extract code snippets, architectural decisions, and problem-solving patterns as institutional memory accessible to entire teams.

**Workflow automation through hooks** leverages GitButler's hook integration where Claude Code passes transcript_path to hook scripts. Parse the JSONL file in hooks to create Git branches named after session summaries: `summary=$(jq -r 'select(.type=="summary") | .summary' $transcript_path | head -1); git checkout -b "claude/${summary}"`. Auto-generate commit messages from tool execution history, linking code changes to AI assistance context.

**Quality assurance and testing** analyzes tool usage patterns to identify risky operations. Count Bash commands with `--dangerously-skip-permissions`: `jq 'select(.message.content[]?.name=="Bash" and .dangerouslySkipPermissions) | .message.content[].input.command' *.jsonl`. Flag sessions modifying production systems, deleting files without backups, or executing commands with elevated privileges. Generate reports for security team review.

## Comparison with alternative chat storage formats

Claude Code's JSONL format differs fundamentally from Aider's markdown-based approach. Aider maintains running `.aider.chat.history.md` files with human-readable conversation flow, embedding code diffs as markdown. This maximizes readability but complicates programmatic parsing and loses structured metadata like token counts. Claude Code optimizes for machine parsing with complete metadata preservation, accepting reduced human readability as a tradeoff for comprehensive analytics.

GitHub Copilot Chat stores conversations in SQLite databases within VS Code extensions, providing relational queries but creating vendor lock-in. The binary format requires specific tools for access, preventing simple shell script analysis. Claude Code's text-based JSONL enables processing with standard Unix tools: `jq`, `grep`, `awk`, making it accessible to broader tooling ecosystems without specialized parsers.

ChatGPT web interface exports to JSON with flattened message arrays losing branching information. The format captures linear conversation flows but can't represent alternative exploration paths. Claude Code's UUID-based threading preserves complete conversation DAGs, enabling undo operations, branch comparisons, and exploration pattern analysis impossible with linear formats.

Cursor IDE uses a proprietary binary format requiring their tools for access, similar to GitHub Copilot's approach. This prevents external analysis, third-party tool development, and long-term archival in open formats. Claude Code's text-based storage ensures conversation data remains accessible regardless of tool availability, supporting multi-decade data retention for institutional knowledge preservation.

## Future-proofing and long-term accessibility

Standardize on TypeScript interfaces from `@anthropic-ai/claude-code-data` as the canonical schema representation. These types receive updates aligned with Claude Code releases, providing forward-compatible parsing. Define internal data models that map from these types, insulating applications from format changes through adapter layers. When Claude Code introduces breaking changes, update only the adapter without modifying core business logic.

Archive session files in open formats alongside parsing tool versions. Store both raw JSONL and exported markdown/JSON with metadata: `{claude_code_version: "1.0.24", parser_version: "2.1.0", export_date: "2025-10-26"}`. This enables future reconstruction even if JSONL parsing libraries become unavailable, as the export formats provide fallback human-readable representations.

Document custom parsing logic extensively, especially handling of edge cases and version-specific behavior. Comment code sections that work around bugs like duplicate entries, explaining the issue and linking to GitHub issues. This knowledge preservation ensures future maintainers understand why seemingly odd parsing logic exists and when it might become obsolete.

Monitor official Anthropic channels for format deprecation notices. Subscribe to GitHub repository releases, follow relevant Twitter/X accounts, and join community Discord servers where format discussions occur. Early awareness of breaking changes enables proactive migration planning, preventing production tool breakage when format updates deploy.