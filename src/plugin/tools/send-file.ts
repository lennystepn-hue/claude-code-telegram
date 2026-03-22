import { createReadStream, statSync } from 'fs';
import { extname } from 'path';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_ATTACHMENT_BYTES, PHOTO_EXTS } from '../access/config.js';

export const sendFileToolSchema = {
  name: 'send_file',
  description: 'Send a local file to a Telegram chat (photo or document).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      file_path: { type: 'string', description: 'Absolute path to the file to send' },
      caption: { type: 'string', description: 'Optional caption for the file' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'file_path'],
  },
};

export async function handleSendFile(
  bot: Bot,
  args: { chat_id: string; file_path: string; caption?: string; reply_to?: number }
): Promise<{ message_id: number }> {
  const { chat_id, file_path, caption, reply_to } = args;
  assertAllowedChat(chat_id);

  const stat = statSync(file_path);
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `File size ${stat.size} exceeds the limit of ${MAX_ATTACHMENT_BYTES} bytes`
    );
  }

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const ext = extname(file_path).toLowerCase();
  const fileName = file_path.split('/').pop() ?? 'file';
  const stream = createReadStream(file_path);
  const inputFile = new InputFile(stream, fileName);

  if (PHOTO_EXTS.has(ext)) {
    const msg = await bot.api.sendPhoto(chat_id, inputFile, {
      caption,
      ...replyParams,
    });
    return { message_id: msg.message_id };
  } else {
    const msg = await bot.api.sendDocument(chat_id, inputFile, {
      caption,
      ...replyParams,
    });
    return { message_id: msg.message_id };
  }
}
