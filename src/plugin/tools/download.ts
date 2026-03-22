import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Bot } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { INBOX_DIR, MAX_ATTACHMENT_BYTES } from '../access/config.js';

export const downloadToolSchema = {
  name: 'download',
  description: 'Download a file from Telegram by file_id and save it to the inbox directory.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID (for access check)' },
      file_id: { type: 'string', description: 'Telegram file_id to download' },
      file_name: { type: 'string', description: 'Optional filename to save as' },
    },
    required: ['chat_id', 'file_id'],
  },
};

export async function handleDownload(
  bot: Bot,
  token: string,
  args: { chat_id: string; file_id: string; file_name?: string }
): Promise<{ file_path: string; size: number }> {
  const { chat_id, file_id, file_name } = args;
  assertAllowedChat(chat_id);

  const file = await bot.api.getFile(file_id);
  if (!file.file_path) {
    throw new Error(`File ${file_id} has no download path`);
  }

  const fileSize = file.file_size ?? 0;
  if (fileSize > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `File size ${fileSize} exceeds limit of ${MAX_ATTACHMENT_BYTES} bytes`
    );
  }

  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  mkdirSync(INBOX_DIR, { recursive: true });

  const saveName =
    file_name ?? file.file_path.split('/').pop() ?? `file_${file_id}`;
  const savePath = join(INBOX_DIR, saveName);
  writeFileSync(savePath, buffer);

  return { file_path: savePath, size: buffer.length };
}
