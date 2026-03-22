import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';

export const sendButtonsToolSchema = {
  name: 'send_buttons',
  description:
    'Send a message with numbered options to the user. Returns immediately — the user will reply with their choice as a normal message (e.g. "1" or the option text). Do NOT block or wait — just send the options and tell Claude to watch for the user\'s next message.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      text: { type: 'string', description: 'Message text / question' },
      buttons: {
        type: 'array',
        description: 'Array of options to display',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            id: { type: 'string' },
          },
          required: ['text', 'id'],
        },
      },
      layout: {
        type: 'number',
        description: 'Number of buttons per row (default: 2)',
      },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'text', 'buttons'],
  },
};

export async function handleSendButtons(
  bot: Bot,
  _callbackRegistry: unknown,
  args: {
    chat_id: string;
    text: string;
    buttons: Array<{ text: string; id: string }>;
    layout?: number;
    reply_to?: number;
  }
): Promise<{ text: string; message_id: number }> {
  const { chat_id, text, buttons, layout = 2, reply_to } = args;
  assertAllowedChat(chat_id);

  // Build numbered options text
  const optionsText = buttons
    .map((btn, i) => `${i + 1}. ${btn.text}`)
    .join('\n');

  const fullText = `${text}\n\n${optionsText}\n\nReply with the number or option name.`;

  // Also send inline keyboard for convenience (clicks won't be captured but look nice)
  const keyboard = new InlineKeyboard();
  let col = 0;
  for (const btn of buttons) {
    // Use a simple callback data — won't be captured but that's OK
    keyboard.text(btn.text, `opt:${btn.id}`);
    col++;
    if (col >= layout) {
      keyboard.row();
      col = 0;
    }
  }

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const msg = await bot.api.sendMessage(chat_id, fullText, {
    ...replyParams,
    reply_markup: keyboard,
  });

  return {
    text: `sent options (id: ${msg.message_id}). User will reply with their choice as a text message. Watch for the next inbound message.`,
    message_id: msg.message_id,
  };
}
