---
description: Configure bot token for Claude Code for Telegram
allowed-tools: Bash, Read, Edit
---

Configure the Telegram bot token for Claude Code for Telegram.

If an argument is provided, save it as the bot token:
1. Create directory: `mkdir -p ~/.claude/channels/claude-code-telegram`
2. Write token: `echo 'TELEGRAM_BOT_TOKEN=<token>' > ~/.claude/channels/claude-code-telegram/.env`
3. Set permissions: `chmod 600 ~/.claude/channels/claude-code-telegram/.env`
4. Tell user to restart Claude Code

If no argument, show current configuration status by checking if the .env file exists and has a token.
