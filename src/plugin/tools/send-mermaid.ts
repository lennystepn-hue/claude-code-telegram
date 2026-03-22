import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { formatCodeBlock } from '../ui/format.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

export const sendMermaidToolSchema = {
  name: 'send_mermaid',
  description:
    'Send a Mermaid diagram to Telegram as a code block (mermaid language hint). ' +
    'If too long, sends as a .mmd document.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      diagram: { type: 'string', description: 'Mermaid diagram source' },
      caption: { type: 'string', description: 'Optional caption shown above the diagram' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'diagram'],
  },
};

export async function handleSendMermaid(
  bot: Bot,
  args: { chat_id: string; diagram: string; caption?: string; reply_to?: number }
): Promise<{ message_id: number; inline: boolean }> {
  const { chat_id, diagram, caption, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const codeBlock = formatCodeBlock(diagram, 'mermaid');
  const body = caption ? `${caption}\n\n${codeBlock}` : codeBlock;

  if (body.length <= MAX_CHUNK_LIMIT) {
    const msg = await bot.api.sendMessage(chat_id, body, replyParams);
    return { message_id: msg.message_id, inline: true };
  }

  // Too long — send as .mmd document
  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, 'diagram.mmd');
  writeFileSync(tmpPath, diagram, 'utf-8');

  const inputFile = new InputFile(tmpPath, 'diagram.mmd');
  const msg = await bot.api.sendDocument(chat_id, inputFile, {
    caption: caption ?? '📊 Mermaid diagram',
    ...replyParams,
  });

  return { message_id: msg.message_id, inline: false };
}
