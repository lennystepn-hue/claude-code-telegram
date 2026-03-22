import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { formatDiff } from '../ui/format.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

export const sendDiffToolSchema = {
  name: 'send_diff',
  description: 'Send a diff to Telegram. Small diffs are sent inline; large ones as a .diff file.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      file: { type: 'string', description: 'Filename the diff applies to' },
      diff: { type: 'string', description: 'Unified diff content' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'file', 'diff'],
  },
};

export async function handleSendDiff(
  bot: Bot,
  args: { chat_id: string; file: string; diff: string; reply_to?: number }
): Promise<{ message_id: number; inline: boolean }> {
  const { chat_id, file, diff, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const formatted = formatDiff(file, diff);

  if (formatted.length <= MAX_CHUNK_LIMIT) {
    const msg = await bot.api.sendMessage(chat_id, formatted, replyParams);
    return { message_id: msg.message_id, inline: true };
  }

  // Large diff: send as .diff file
  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });
  const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tmpPath = join(tmpDir, `${safeName}.diff`);
  writeFileSync(tmpPath, diff, 'utf-8');

  const inputFile = new InputFile(tmpPath, `${safeName}.diff`);
  const msg = await bot.api.sendDocument(chat_id, inputFile, {
    caption: `📄 ${file}`,
    ...replyParams,
  });

  return { message_id: msg.message_id, inline: false };
}
