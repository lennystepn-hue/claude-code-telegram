# Claude Code for Telegram

Full Claude Code CLI experience in Telegram — streaming responses, inline buttons, task tracking, diffs, file transfers, and session management.

## Features

- **Streaming responses** — Live-updating messages as Claude thinks and types
- **Inline buttons** — Interactive keyboard buttons for choices and confirmations
- **Task tracking** — Real-time task list updates with progress indicators
- **Code diffs** — Formatted diff display for file changes
- **File transfers** — Upload files to Claude; download generated files back
- **Session management** — Daemon mode to manage Claude Code sessions across projects
- **Access control** — Pairing codes, allowlists, and group policies
- **Slash commands** — `/configure` and `/access` skills for in-terminal management

## Installation

Install via the Claude Code plugin marketplace:

```
claude plugin install claude-code-telegram
```

Or clone and link manually:

```bash
git clone https://github.com/lennystepn-hue/claude-code-telegram
cd claude-code-telegram
bun install
claude plugin link .
```

## Configuration

### 1. Create a Telegram bot

Talk to [@BotFather](https://t.me/BotFather) on Telegram to create a bot and get your token.

### 2. Configure the token

Run the configure skill from your terminal:

```
/configure <YOUR_BOT_TOKEN>
```

This saves the token to `~/.claude/channels/claude-code-telegram/.env`.

### 3. Set access policy

```
/access policy pairing
```

Then send a message to your bot — it will reply with a pairing code. Run:

```
/access pair <code>
```

## Usage

### Plugin mode (MCP server)

Start Claude Code with the Telegram channel plugin:

```bash
claude --channels plugin:claude-code-telegram
```

Or set it as your default channel in Claude Code settings.

### Daemon mode

The daemon manages Claude Code sessions across multiple projects and provides a control interface:

```bash
bun run daemon
```

Daemon bot commands:
- `/sessions` — Show active session with stop/new buttons
- `/stop` — Stop the current session
- `/new <path>` — Start a new session in the given directory

## Access Control

The `/access` skill manages who can interact with your bot:

```
/access status                    # Show current config
/access policy pairing            # Require pairing codes
/access policy allowlist          # Only pre-approved users
/access policy disabled           # Disable all DMs
/access pair <code>               # Approve a pairing request
/access allow <user_id>           # Add user to allowlist
/access remove <user_id>          # Remove user from allowlist
/access group add <group_id>      # Allow a group
/access group remove <group_id>   # Remove a group
```

Config is stored at `~/.claude/channels/claude-code-telegram/access.json`.

## Development

```bash
bun install          # Install dependencies
bun test             # Run tests (69 tests)
bun run typecheck    # TypeScript type check
bun run start        # Start the plugin server
bun run daemon       # Start the session daemon
```

## Architecture

```
src/
  plugin/            # MCP server plugin (main mode)
    access/          # Access control (gate, config)
    bot/             # Grammy bot (inbound handling, commands, callbacks)
    stream/          # Streaming state management and throttle
    tools/           # MCP tool handlers (reply, diff, buttons, tasks, files)
    ui/              # Text chunking and formatting utilities
  daemon/            # Session daemon (separate bot for managing Claude sessions)
    session-manager  # Spawn/stop Claude Code child processes
    bot              # Daemon control bot (/sessions, /stop, /new)

.claude-plugin/
  plugin.json        # Plugin manifest
  commands/
    configure.md     # /configure skill
    access.md        # /access skill
```

## License

MIT — Copyright 2024 lennystepn-hue
