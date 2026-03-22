import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { CallbackRegistry } from '../bot/callbacks.js';
import { assertAllowedChat } from '../access/gate.js';

export const sendButtonsToolSchema = {
  name: 'send_buttons',
  description:
    'Send an inline keyboard to the user and block until they click a button (or timeout). Returns the selected button id.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      text: { type: 'string', description: 'Message text shown above the buttons' },
      buttons: {
        type: 'array',
        description: 'Array of buttons to display',
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
  callbackRegistry: CallbackRegistry,
  args: {
    chat_id: string;
    text: string;
    buttons: Array<{ text: string; id: string }>;
    layout?: number;
    reply_to?: number;
  }
): Promise<{ selected: string; message_id: number }> {
  const { chat_id, text, buttons, layout = 2, reply_to } = args;
  assertAllowedChat(chat_id);

  const keyboard = new InlineKeyboard();
  let col = 0;

  for (const btn of buttons) {
    // We need the message_id to encode the callback data, but we don't have it yet.
    // We'll use a placeholder approach: encode data after sending.
    // Instead, build raw inline_keyboard buttons manually using message_id placeholder.
    // We'll build the keyboard after sending by encoding with a temp approach.
    // Actually the standard approach: send first without real callback data (impossible),
    // so we use a two-step: send with placeholder, then edit with real data.
    //
    // Simpler: encode with messageId=0 as placeholder, then after send, re-encode.
    // But CallbackRegistry.encodeCallbackData requires the real messageId.
    //
    // Best approach: send with raw callback_data that we construct, then register.
    // We'll use a unique token per button since we don't have msgId yet.
    // Actually, let's just use the button id directly as callback data and parse it differently.
    //
    // Looking at CallbackRegistry: it uses format "btn:<msgId>:<buttonId>"
    // So we MUST have the messageId first. Strategy: send message, get msgId, edit with real keyboard.

    // We'll just add a placeholder — we'll rebuild after getting msg.
    void btn; // suppress unused warning
    col++;
    if (col >= layout) {
      keyboard.row();
      col = 0;
    }
  }

  // Step 1: Send message without keyboard to get message_id
  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};
  const msg = await bot.api.sendMessage(chat_id, text, replyParams);
  const messageId = msg.message_id;

  // Step 2: Build keyboard with real message_id encoded callback data
  const realKeyboard = new InlineKeyboard();
  let c = 0;
  for (const btn of buttons) {
    const callbackData = callbackRegistry.encodeCallbackData(messageId, btn.id);
    realKeyboard.text(btn.text, callbackData);
    c++;
    if (c >= layout && c < buttons.length) {
      realKeyboard.row();
      c = 0;
    }
  }

  // Step 3: Edit message to attach real keyboard
  await bot.api.editMessageText(chat_id, messageId, text, {
    reply_markup: realKeyboard,
  });

  // Step 4: Register and block until click or timeout
  const selected = await callbackRegistry.register(chat_id, messageId, buttons);

  // Step 5: Edit message to show selection result (remove buttons)
  const selectedBtn = buttons.find((b) => b.id === selected);
  const resultText =
    selected === '__timeout__'
      ? `${text}\n\n⏱ Timed out`
      : selected === '__cancelled__'
      ? `${text}\n\n❌ Cancelled`
      : `${text}\n\n✅ Selected: ${selectedBtn?.text ?? selected}`;

  try {
    await bot.api.editMessageText(chat_id, messageId, resultText);
  } catch {
    // Ignore edit errors (message may have been deleted)
  }

  return { selected, message_id: messageId };
}
