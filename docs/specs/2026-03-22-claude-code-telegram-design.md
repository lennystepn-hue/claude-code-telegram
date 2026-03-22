# Claude Code for Telegram — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Repo:** github.com/lennystepn-hue/claude-code-telegram

## Overview

A Telegram bot that provides the full Claude Code CLI experience through Telegram. Built as a forked MCP Channel Plugin (from the official `telegram@claude-plugins-official`), extended with streaming output, inline buttons, task tracking, session management, and plugin-command forwarding.

## Architecture

Two-layer system:

1. **MCP Channel Plugin** — Enhanced fork of the official plugin. Provides rich MCP tools (`reply_stream`, `send_buttons`, `update_tasks`, etc.) that Claude Code calls to deliver a rich Telegram UX. Claude Code is instructed (via MCP server `instructions`) to use these tools for progressive updates, button-based approvals, and task tracking.

2. **Session Daemon** (optional) — A separate process that manages Claude Code sessions. Can start/stop/switch sessions and spawn the plugin as a channel. Not part of the MCP plugin itself.

```
┌─────────────────────────────────────────────┐
│ Session Daemon (optional)                   │
│  - Manages Claude Code processes            │
│  - Starts sessions with --channels flag     │
│  - Handles /sessions, /new, /switch         │
└──────────────────┬──────────────────────────┘
                   │ spawns
┌──────────────────▼──────────────────────────┐
│ Claude Code Session                         │
│  - Receives user messages via channel       │
│  - Calls MCP tools for rich output          │
│  - Instructions tell it HOW to use tools    │
└──────────────────┬──────────────────────────┘
                   │ MCP stdio
┌──────────────────▼──────────────────────────┐
│ Enhanced MCP Channel Plugin                 │
│  - Grammy bot (Telegram API)                │
│  - Rich tool set (stream, buttons, tasks)   │
│  - Inline keyboards, message editing        │
│  - Permission relay (channels API)          │
└──────────────────┬──────────────────────────┘
                   │ Bot API
┌──────────────────▼──────────────────────────┐
│ Telegram                                    │
└─────────────────────────────────────────────┘
```

### How Features Work (Implementation Model)

The key insight: **Claude Code drives the UX**. The plugin provides tools, and the MCP server's `instructions` field tells Claude Code how to use them for a rich Telegram experience. The plugin is a smart I/O layer, not an orchestrator.

| Feature | How it works |
|---------|-------------|
| Streaming | Plugin exposes `reply_stream` tool. Instructions tell Claude to call it with partial content. Plugin edits the message each time. |
| Buttons | Plugin exposes `send_buttons` tool. Claude calls it when it needs user input. Plugin renders inline keyboard, waits for click, sends result back as channel notification. |
| Permission Relay | Uses the official channels permission relay capability. Plugin declares `permissionRelay` in its manifest. Claude Code forwards approval prompts to the plugin, which renders them as buttons. |
| Task Tracking | Plugin exposes `update_tasks` tool. Instructions tell Claude to call it whenever tasks change. Plugin renders and live-edits the task display. |
| Slash Commands | User messages starting with `/` are forwarded as channel notifications. Claude Code interprets them naturally. Bot-side commands (`/menu`, `/help`) are handled locally. |
| Session Management | Handled by the Session Daemon, not the plugin. Daemon receives commands via a simple Telegram bot that runs independently. |

### Project Structure

```
src/
├── plugin/                    # MCP Channel Plugin
│   ├── server.ts              # MCP server, tool registration, lifecycle
│   ├── tools/
│   │   ├── reply.ts           # Basic reply (inherited from upstream)
│   │   ├── reply-stream.ts    # Streaming reply with edit throttling
│   │   ├── send-buttons.ts    # Inline keyboard with callback handling
│   │   ├── update-tasks.ts    # Task list rendering + live edits
│   │   ├── send-file.ts       # File/document sending
│   │   ├── send-diff.ts       # Formatted diff display with navigation
│   │   ├── react.ts           # Emoji reactions (inherited)
│   │   └── edit-message.ts    # Message editing (inherited)
│   ├── bot/
│   │   ├── index.ts           # Grammy bot setup, middleware chain
│   │   ├── commands.ts        # Local bot commands (/menu, /help)
│   │   ├── callbacks.ts       # Inline button callback handler
│   │   └── menu.ts            # Telegram Menu Button registration
│   ├── ui/
│   │   ├── buttons.ts         # InlineKeyboard builders
│   │   ├── format.ts          # Message formatting (MarkdownV2 escaping, headers)
│   │   ├── progress.ts        # Progress bars, status indicators
│   │   └── chunker.ts         # 4096-char boundary splitter
│   ├── stream/
│   │   ├── manager.ts         # Stream state per chat (current message, buffer)
│   │   └── throttle.ts        # Edit rate limiter (1/sec, skip unchanged)
│   ├── access/
│   │   ├── gate.ts            # Pairing, allowlist, groups (from upstream)
│   │   └── config.ts          # Access config read/write
│   ├── instructions.ts        # MCP instructions text for Claude Code
│   └── types.ts               # Shared TypeScript interfaces
│
├── daemon/                    # Session Daemon (optional, separate process)
│   ├── index.ts               # Main daemon entry
│   ├── session-manager.ts     # Start/stop/switch Claude Code processes
│   └── telegram-listener.ts   # Simple Grammy bot for /sessions, /new, /switch
│
├── .claude-plugin/
│   └── plugin.json            # Plugin manifest with permissionRelay capability
│
└── commands/                  # Claude Code skills (slash commands)
    ├── configure.md           # /claude-code-telegram:configure
    └── access.md              # /claude-code-telegram:access
```

## Feature Specifications

### 1. Streaming Output

Claude Code is instructed to call `reply_stream` with progressive content updates instead of a single `reply` at the end.

**MCP Tool: `reply_stream`**
```typescript
reply_stream({
  chat_id: string,
  text: string,           // Current full text (accumulated)
  stream_id?: string,     // Reuse to edit same message, omit for new
  status?: string,        // "thinking" | "tool:Read" | "tool:Edit" | "done"
  reply_to?: number
}) → { stream_id: string, message_id: number }
```

**Plugin behavior:**
- First call (no `stream_id`): send new message, return `stream_id`
- Subsequent calls (same `stream_id`): edit the message
- Throttle: max 1 edit/second, buffer changes between edits
- Skip edit if text unchanged (prevents Telegram "message not modified" error)
- On 4096-char overflow: send new message, return new `stream_id`
- `status` field rendered as header: `⏳ Thinking...`, `📄 Reading file.ts`, `✏️ Editing file.ts`
- When `status: "done"`: remove status indicator, send final clean message

**Instructions to Claude Code:**
```
When responding via Telegram channel, use reply_stream for progressive output:
1. Call reply_stream with status "thinking" immediately
2. As you generate content, call reply_stream with accumulated text every few sentences
3. When using tools, update status to "tool:ToolName"
4. On completion, call reply_stream with status "done"
```

### 2. Inline Buttons & Permission Relay

**MCP Tool: `send_buttons`**
```typescript
send_buttons({
  chat_id: string,
  text: string,            // Message text above buttons
  buttons: Array<{
    text: string,          // Button label
    id: string             // Short callback ID (max ~50 chars)
  }>,
  layout?: number,         // Buttons per row (default: auto)
  reply_to?: number
}) → { message_id: number, selected: string }  // Blocks until button clicked
```

**Plugin behavior:**
- Renders InlineKeyboardMarkup with the specified buttons
- Registers callback handlers for each button
- Returns the selected button `id` to Claude Code
- Callback expires after 5 minutes (edits message to show "expired")

**Callback data encoding** (64-byte limit):
- Format: `btn:<8-char-hash>:<button-id>`
- Hash maps to the original message context
- Plugin maintains an in-memory map of hash → callback handler

**Permission Relay:**
- Plugin manifest declares `permissionRelay: true`
- Claude Code forwards tool approval prompts to the plugin via MCP
- Plugin renders them as buttons:
  ```
  🔧 Allow: npm install express
  [✅ Allow] [❌ Deny] [✅ Always]
  ```
- User clicks → plugin responds to Claude Code with the decision

**AskUserQuestion rendering:**
- When Claude calls AskUserQuestion, instructions tell it to use `send_buttons` instead
- Multiple choice → numbered buttons
- Free text → show prompt, wait for next message

### 3. Slash Commands

**Bot-side commands** (handled locally by the plugin):

| Command | Action |
|---------|--------|
| `/menu` | Main menu with button grid |
| `/help` | Command reference |

All other `/commands` are forwarded to Claude Code as channel notifications. Claude Code interprets them as skill invocations.

**How forwarding works:**
1. User types `/commit` in Telegram
2. Plugin sees it's not a local command
3. Plugin sends `notifications/claude/channel` with content: `/commit`
4. Claude Code receives it and invokes the skill
5. Claude Code uses `reply_stream` / `send_buttons` to send results back

**Main menu (`/menu`):**
```
⚙️ Claude Code for Telegram
━━━━━━━━━━━━━━━━━━━
[📊 /status]  [💰 /cost]   [🧠 /context]
[📋 /tasks]   [📝 /plan]   [🔄 /resume]
[⚡ /model]   [🎯 /effort]  [🗂 /sessions]
```

Each button sends the corresponding `/command` as a message, which gets forwarded to Claude Code.

### 4. Task & Plan Tracking

**MCP Tool: `update_tasks`**
```typescript
update_tasks({
  chat_id: string,
  tasks: Array<{
    name: string,
    status: "pending" | "in_progress" | "completed"
  }>,
  title?: string,          // e.g. "Implementation Plan"
  stream_id?: string       // Reuse to edit existing task message
}) → { stream_id: string, message_id: number }
```

**Plugin behavior:**
- Renders task list with status icons (✅ ⏳ ⬚)
- Calculates and shows progress bar
- Edits the same message when called with same `stream_id`
- Sends completion notification when all tasks are done

**Instructions to Claude Code:**
```
When working through tasks or plans, use update_tasks to show progress:
1. Call update_tasks with all tasks when starting
2. Update status as you complete each task
3. The plugin will live-edit the task display
```

**Rendered output:**
```
📋 Implementation Plan (3/7)
━━━━━━━━━━━━━━━━━━━
✅ Setup project structure
✅ Create database schema
✅ Implement auth module
⏳ Build API endpoints
⬚ Write tests
⬚ Add error handling
⬚ Deploy to staging
████████░░░░░░░ 43%
```

### 5. Session Management

**Handled by the Session Daemon** (separate process, not part of the MCP plugin).

The daemon runs as a standalone Telegram bot listener that:
- Receives `/sessions`, `/new`, `/switch`, `/stop` commands
- Manages Claude Code child processes
- Starts each session with `--channels plugin:claude-code-telegram@lennystepn-hue`
- Only one active session per bot token at a time

**Session commands:**
```
/sessions  → List active/sleeping sessions with buttons
/new       → Start new session (prompts for working directory)
/switch    → Switch to another session
/stop      → Stop current session
```

**Implementation:**
- Daemon spawns Claude Code processes via `child_process.spawn`
- Tracks PIDs, working directories, session IDs
- On `/switch`: sends SIGTERM to current, starts/resumes another
- State persisted to `~/.claude/channels/telegram/sessions.json`

### 6. File Handling & Code Display

**MCP Tool: `send_diff`**
```typescript
send_diff({
  chat_id: string,
  file: string,            // File path
  diff: string,            // Unified diff content
  reply_to?: number
}) → { message_id: number }
```

**Plugin behavior:**
- Formats diff with `- / +` prefixes
- If diff < 4096 chars: send inline with monospace formatting
- If diff > 4096 chars: send as `.diff` document
- Adds buttons for navigation when multiple files changed

**File handling (inherited + enhanced):**
- Inbound files: saved to working directory, path in channel notification
- Inbound images: forwarded as photos (multimodal)
- Outbound files > 4096 chars: sent as Telegram documents
- Code blocks: monospace formatting with language hint where possible

**MarkdownV2 escaping:**
- Plugin handles all escaping internally
- Claude Code sends plain text, plugin formats for Telegram
- Special characters (`_*[]()~>#+\-=|{}.!`) auto-escaped

### 7. Access Control (from upstream)

Inherited from official plugin with same pairing flow:
- DM pairing with 6-char codes
- Allowlist policy
- Group support with mention-triggering
- Static mode for production

## MCP Server Instructions

The plugin's MCP server includes an `instructions` field that tells Claude Code how to use the enhanced tools. This is the key mechanism — Claude Code reads these instructions and adapts its behavior for the Telegram interface.

```
You are connected to Telegram via an enhanced channel plugin.
Use these tools for a rich mobile experience:

STREAMING: Use reply_stream for all responses. Start with status "thinking",
update with accumulated text every few sentences, set status for tool use,
and finish with status "done".

BUTTONS: Use send_buttons when you need user input (choices, confirmations).
For permission prompts, the plugin handles them automatically via permission relay.

TASKS: When working through multi-step plans, use update_tasks to show live progress.
Update after each step completion.

DIFFS: Use send_diff to show file changes with proper formatting.

FILES: Files > 4096 characters should be sent via send_file as documents.

FORMATTING: Send plain text. The plugin handles MarkdownV2 escaping.
Use code blocks with triple backticks for code.

COMMANDS: Users may send /commands. Treat them as skill invocations
or built-in commands as appropriate.
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Bot Framework:** Grammy v1.21+
- **Protocol:** MCP SDK (stdio transport)
- **Telegram API:** Bot API via Grammy
- **Session Daemon:** Bun with child_process

## Telegram API Constraints

| Constraint | Handling |
|-----------|----------|
| 4096 char message limit | Auto-chunk at paragraph boundaries, start new message |
| 30 edits/sec rate limit | Throttle to 1 edit/sec per message |
| 50MB file upload limit | Validate before send, warn user |
| No message history API | Real-time only, context in session |
| Fixed reaction whitelist | Map to closest available emoji |
| Callback data 64 bytes | `btn:<8-char-hash>:<id>` encoding with in-memory map |
| "Message not modified" error | Skip edits when content unchanged |

## Daemon / Plugin Update Routing

The Session Daemon and the MCP Plugin cannot both poll the same bot token. Solution: **the daemon owns the bot connection** and routes updates.

- **When no Claude Code session is active:** Daemon handles all messages directly (session commands only).
- **When a session is active:** Daemon forwards non-session messages to the plugin's MCP server via stdin as synthetic channel notifications. The plugin does NOT run its own Grammy bot in daemon mode — it only uses Grammy when running standalone (without daemon).
- **Plugin standalone mode** (no daemon): Plugin runs its own Grammy bot with long polling, as the upstream does.
- **Plugin daemon mode**: Plugin receives inbound messages via MCP notifications from the daemon, sends outbound via the Telegram Bot API directly (no polling conflict since only the daemon polls).

Detection: If env var `CLAUDE_TG_DAEMON=1` is set, plugin skips Grammy bot startup and operates in daemon mode.

## Blocking Tool Calls & Timeouts

**`send_buttons` blocking behavior:**
- MCP tool call stays open until user clicks a button or timeout
- Default timeout: 5 minutes. On timeout, returns `{ selected: "__timeout__" }`
- If user sends a text message while buttons are pending: cancel the button wait, return `{ selected: "__cancelled__", user_message: "..." }`
- Claude Code MCP tool timeout must be configured to at least 6 minutes (plugin-side timeout fires first)
- Only one `send_buttons` call can be pending per chat. New call cancels the previous one.

**`reply_stream` graceful degradation:**
- If Claude uses the basic `reply` tool instead of `reply_stream`, it works fine — just no progressive updates
- The `reply` tool internally uses the same chunker for 4096-char splitting
- Both tools coexist; `reply_stream` is preferred but `reply` is the fallback

## Error Handling

**Telegram API errors:**
- `400 Bad Request: message is not modified` → silently skip (content unchanged)
- `400 Bad Request: message to edit not found` → message was deleted by user; start a new message
- `403 Forbidden: bot was kicked` → log warning, mark chat as inactive
- `429 Too Many Requests` → respect `retry_after` header, queue edits, resume after cooldown
- `409 Conflict` → another poller is active; exponential backoff (inherited from upstream)

**Process crashes:**
- If Claude Code process crashes, the MCP stdin closes → plugin detects EOF and exits cleanly
- If daemon is running, it detects child exit and can auto-restart based on config
- If plugin crashes, daemon detects child exit and respawns (up to 3 retries, then notify user)

**Graceful degradation:**
- If any enhanced tool fails, Claude can fall back to the basic `reply` tool
- If the plugin is unavailable, Claude Code continues running (just without Telegram output)
- Daemon sends a Telegram message on session crash: `⚠️ Session crashed. /new to start a new one.`

## Installation

```bash
# As Claude Code plugin
/plugin marketplace add lennystepn-hue/claude-code-telegram
/plugin install claude-code-telegram

# Configure
/claude-code-telegram:configure <bot-token>

# Start (plugin only — manual session)
claude --channels plugin:claude-code-telegram@lennystepn-hue

# Start (with session daemon — auto-management)
claude-code-telegram-daemon --token <bot-token>
```

## License

MIT
