import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';

const HELP_TEXT = `
*Claude Code Telegram Bot*

I connect Claude Code AI assistant to Telegram, giving you a full CLI experience in chat\\.

*Commands:*
/start \\- Welcome message
/help \\- Show this help
/menu \\- Show command menu

*Capabilities:*
• Live\\-streaming responses
• File uploads and downloads
• Inline button interactions
• Task progress tracking
• Code diff display

Send any message to chat with Claude\!
`.trim();

const WELCOME_TEXT = `
*Welcome to Claude Code\\!* 👋

I'm your AI coding assistant powered by Claude\\.

Type a message to get started, or use /help to see available commands\\.
`.trim();

const MENU_COMMANDS = [
  { label: 'Help', cmd: '/help', icon: '❓' },
  { label: 'Status', cmd: '/status', icon: '📊' },
  { label: 'Cancel', cmd: '/cancel', icon: '❌' },
  { label: 'Clear', cmd: '/clear', icon: '🗑' },
];

export async function handleLocalCommand(
  bot: Bot,
  ctx: Context,
  text: string
): Promise<boolean> {
  const chatId = ctx.chat?.id?.toString();
  if (!chatId) return false;

  const command = text.split(/\s+/)[0].toLowerCase();

  if (command === '/start') {
    await bot.api.sendMessage(chatId, WELCOME_TEXT, { parse_mode: 'MarkdownV2' });
    return true;
  }

  if (command === '/help') {
    await bot.api.sendMessage(chatId, HELP_TEXT, { parse_mode: 'MarkdownV2' });
    return true;
  }

  if (command === '/menu') {
    const keyboard = new InlineKeyboard();
    let col = 0;
    for (const item of MENU_COMMANDS) {
      keyboard.text(`${item.icon} ${item.label}`, `cmd:${item.cmd}`);
      col++;
      if (col >= 2) {
        keyboard.row();
        col = 0;
      }
    }
    await bot.api.sendMessage(chatId, '📋 *Menu*', {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard,
    });
    return true;
  }

  return false;
}
