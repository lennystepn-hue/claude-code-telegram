import { createReadStream, statSync } from 'fs';
import { extname } from 'path';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_ATTACHMENT_BYTES, PHOTO_EXTS } from '../access/config.js';

export const sendScreenshotToolSchema = {
  name: 'send_screenshot',
  description:
    'Send a screenshot or image file to Telegram. ' +
    'Image extensions are sent as photos; other files as documents. ' +
    'A 📸 prefix is added to the caption automatically.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      file_path: { type: 'string', description: 'Absolute path to the screenshot or image file' },
      caption: { type: 'string', description: 'Optional caption (📸 prefix is added automatically)' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'file_path'],
  },
};

export async function handleSendScreenshot(
  bot: Bot,
  args: { chat_id: string; file_path: string; caption?: string; reply_to?: number }
): Promise<{ message_id: number; as_photo: boolean }> {
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

  const fullCaption = caption ? `📸 ${caption}` : '📸';

  const ext = extname(file_path).toLowerCase();
  const fileName = file_path.split('/').pop() ?? 'screenshot';
  const stream = createReadStream(file_path);
  const inputFile = new InputFile(stream, fileName);

  if (PHOTO_EXTS.has(ext)) {
    const msg = await bot.api.sendPhoto(chat_id, inputFile, {
      caption: fullCaption,
      ...replyParams,
    });
    return { message_id: msg.message_id, as_photo: true };
  } else {
    const msg = await bot.api.sendDocument(chat_id, inputFile, {
      caption: fullCaption,
      ...replyParams,
    });
    return { message_id: msg.message_id, as_photo: false };
  }
}
