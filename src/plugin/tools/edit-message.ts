import type { Bot } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';

export const editMessageToolSchema = {
  name: 'edit_message',
  description: 'Edit the text of an existing Telegram message.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      message_id: { type: 'number', description: 'Message ID to edit' },
      text: { type: 'string', description: 'New message text' },
      parse_mode: {
        type: 'string',
        description: 'Optional parse mode (MarkdownV2 or HTML)',
      },
    },
    required: ['chat_id', 'message_id', 'text'],
  },
};

export async function handleEditMessage(
  bot: Bot,
  args: {
    chat_id: string;
    message_id: number;
    text: string;
    parse_mode?: string;
  }
): Promise<{ ok: boolean }> {
  const { chat_id, message_id, text, parse_mode } = args;
  assertAllowedChat(chat_id);
  const extra: Record<string, unknown> = {};
  if (parse_mode) extra.parse_mode = parse_mode;
  await bot.api.editMessageText(chat_id, message_id, text, extra);
  return { ok: true };
}
