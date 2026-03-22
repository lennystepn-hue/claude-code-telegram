import type { Bot } from 'grammy';
import type { ReactionTypeEmoji } from '@grammyjs/types';
import { assertAllowedChat } from '../access/gate.js';

export const reactToolSchema = {
  name: 'react',
  description: 'Set a reaction emoji on a Telegram message.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      message_id: { type: 'number', description: 'Message ID to react to' },
      emoji: { type: 'string', description: 'Emoji to react with (e.g. "👍")' },
    },
    required: ['chat_id', 'message_id', 'emoji'],
  },
};

export async function handleReact(
  bot: Bot,
  args: { chat_id: string; message_id: number; emoji: string }
): Promise<{ ok: boolean }> {
  const { chat_id, message_id, emoji } = args;
  assertAllowedChat(chat_id);
  await bot.api.setMessageReaction(chat_id, message_id, [
    { type: 'emoji', emoji: emoji as ReactionTypeEmoji['emoji'] },
  ]);
  return { ok: true };
}
