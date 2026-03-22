import { createReadStream, statSync } from 'fs';
import { extname } from 'path';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { chunk } from '../ui/chunker.js';
import { assertAllowedChat, loadAccess } from '../access/gate.js';
import { MAX_CHUNK_LIMIT, PHOTO_EXTS } from '../access/config.js';

export const replyToolSchema = {
  name: 'reply',
  description: 'Send a text or file reply to a Telegram chat.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      text: { type: 'string', description: 'Message text to send' },
      file_path: { type: 'string', description: 'Optional path to a file to send' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id'],
  },
};

export async function handleReply(
  bot: Bot,
  args: {
    chat_id: string;
    text?: string;
    file_path?: string;
    reply_to?: number;
  }
): Promise<{ message_ids: number[] }> {
  const { chat_id, text, file_path, reply_to } = args;
  assertAllowedChat(chat_id);
  const access = loadAccess();

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const sentIds: number[] = [];

  // Send file if provided
  if (file_path) {
    const ext = extname(file_path).toLowerCase();
    const stream = createReadStream(file_path);
    const inputFile = new InputFile(stream, file_path.split('/').pop() ?? 'file');

    if (PHOTO_EXTS.has(ext)) {
      const msg = await bot.api.sendPhoto(chat_id, inputFile, {
        caption: text,
        ...replyParams,
      });
      sentIds.push(msg.message_id);
    } else {
      const msg = await bot.api.sendDocument(chat_id, inputFile, {
        caption: text,
        ...replyParams,
      });
      sentIds.push(msg.message_id);
    }
    return { message_ids: sentIds };
  }

  // Text-only path
  if (!text) return { message_ids: [] };

  const limit = access.textChunkLimit ?? MAX_CHUNK_LIMIT;
  const mode = access.chunkMode ?? 'newline';
  const chunks = chunk(text, limit, mode);

  for (let i = 0; i < chunks.length; i++) {
    const params = i === 0 ? replyParams : {};
    const msg = await bot.api.sendMessage(chat_id, chunks[i], params);
    sentIds.push(msg.message_id);
  }

  return { message_ids: sentIds };
}
