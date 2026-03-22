import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { formatCodeBlock } from '../ui/format.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  rust: 'rs',
  go: 'go',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  shell: 'sh',
  bash: 'sh',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  markdown: 'md',
};

export const sendCodeImageToolSchema = {
  name: 'send_code_image',
  description:
    'Send a code snippet as a formatted Telegram message. ' +
    'Short snippets are sent inline; longer ones as a document file.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      code: { type: 'string', description: 'The code snippet to send' },
      language: { type: 'string', description: 'Programming language for syntax hint (e.g. typescript, python)' },
      filename: { type: 'string', description: 'Optional filename header to display above the code' },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'code'],
  },
};

export async function handleSendCodeImage(
  bot: Bot,
  args: { chat_id: string; code: string; language?: string; filename?: string; reply_to?: number }
): Promise<{ message_id: number; inline: boolean }> {
  const { chat_id, code, language, filename, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const header = filename ? `📄 ${filename}\n` : '';
  const codeBlock = formatCodeBlock(code, language);
  const body = `${header}${codeBlock}`;

  if (body.length <= MAX_CHUNK_LIMIT) {
    const msg = await bot.api.sendMessage(chat_id, body, replyParams);
    return { message_id: msg.message_id, inline: true };
  }

  // Send as document
  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });

  let docName = filename ?? 'snippet';
  if (language && !docName.includes('.')) {
    const ext = LANGUAGE_EXTENSIONS[language.toLowerCase()];
    if (ext) docName = `${docName}.${ext}`;
  }
  // Sanitize
  const safeName = docName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tmpPath = join(tmpDir, safeName);
  writeFileSync(tmpPath, code, 'utf-8');

  const inputFile = new InputFile(tmpPath, safeName);
  const caption = filename ? `📄 ${filename}` : (language ? `📄 code.${LANGUAGE_EXTENSIONS[language.toLowerCase()] ?? 'txt'}` : '📄 snippet');
  const msg = await bot.api.sendDocument(chat_id, inputFile, {
    caption,
    ...replyParams,
  });

  return { message_id: msg.message_id, inline: false };
}
