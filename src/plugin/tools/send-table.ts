import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

export const sendTableToolSchema = {
  name: 'send_table',
  description:
    'Send a formatted monospace table to Telegram. ' +
    'If too wide or long, sends as a .txt document.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      headers: {
        type: 'array',
        description: 'Column headers',
        items: { type: 'string' },
      },
      rows: {
        type: 'array',
        description: 'Table rows (each row is an array of strings)',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      title: { type: 'string', description: 'Optional table title' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'headers', 'rows'],
  },
};

function renderTable(
  headers: string[],
  rows: string[][],
  title?: string
): string {
  // Compute column widths
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] ?? '').length), 0);
    return Math.max(h.length, maxRow);
  });

  const formatRow = (cells: string[]) =>
    cells.map((c, i) => (c ?? '').padEnd(colWidths[i])).join('  ');

  const headerRow = formatRow(headers);
  const separator = colWidths.map((w) => '─'.repeat(w)).join('──');
  const totalWidth = headerRow.length;

  const lines: string[] = [];
  if (title) {
    lines.push(`📋 ${title}`);
    lines.push('━'.repeat(Math.min(totalWidth, 40)));
  }
  lines.push(headerRow);
  lines.push(separator);
  for (const row of rows) {
    lines.push(formatRow(row));
  }

  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

export async function handleSendTable(
  bot: Bot,
  args: {
    chat_id: string;
    headers: string[];
    rows: string[][];
    title?: string;
    reply_to?: number;
  }
): Promise<{ message_id: number; inline: boolean }> {
  const { chat_id, headers, rows, title, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const rendered = renderTable(headers, rows, title);

  if (rendered.length <= MAX_CHUNK_LIMIT) {
    const msg = await bot.api.sendMessage(chat_id, rendered, replyParams);
    return { message_id: msg.message_id, inline: true };
  }

  // Too large — send as .txt document
  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, 'table.txt');

  // Plain text version (no backticks) for the file
  const plainLines: string[] = [];
  if (title) plainLines.push(`${title}\n`);
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] ?? '').length), 0);
    return Math.max(h.length, maxRow);
  });
  const formatRow = (cells: string[]) =>
    cells.map((c, i) => (c ?? '').padEnd(colWidths[i])).join('  ');
  plainLines.push(formatRow(headers));
  plainLines.push(colWidths.map((w) => '─'.repeat(w)).join('──'));
  for (const row of rows) plainLines.push(formatRow(row));

  writeFileSync(tmpPath, plainLines.join('\n'), 'utf-8');

  const inputFile = new InputFile(tmpPath, 'table.txt');
  const msg = await bot.api.sendDocument(chat_id, inputFile, {
    caption: title ? `📋 ${title}` : '📋 Table',
    ...replyParams,
  });

  return { message_id: msg.message_id, inline: false };
}
