import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Bot } from 'grammy';
import { InputFile } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

export const sendDepGraphToolSchema = {
  name: 'send_dep_graph',
  description:
    'Send a dependency graph as an ASCII tree to Telegram. ' +
    'If too long, sends as a .txt document.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      root: { type: 'string', description: 'Root package or project name' },
      dependencies: {
        type: 'array',
        description: 'List of top-level dependencies with their own sub-dependencies',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Dependency name (e.g. express@4.18.0)' },
            deps: {
              type: 'array',
              description: 'Sub-dependencies of this package',
              items: { type: 'string' },
            },
          },
          required: ['name'],
        },
      },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'root', 'dependencies'],
  },
};

function renderDepGraph(
  root: string,
  dependencies: { name: string; deps?: string[] }[]
): string {
  const lines: string[] = [];
  lines.push(`📦 ${root}`);

  const total = dependencies.length;
  for (let i = 0; i < total; i++) {
    const dep = dependencies[i];
    const isLast = i === total - 1;
    const connector = isLast ? '└── ' : '├── ';
    lines.push(`${connector}${dep.name}`);

    if (dep.deps && dep.deps.length > 0) {
      const prefix = isLast ? '    ' : '│   ';
      const subTotal = dep.deps.length;
      for (let j = 0; j < subTotal; j++) {
        const subIsLast = j === subTotal - 1;
        const subConnector = subIsLast ? '└── ' : '├── ';
        lines.push(`${prefix}${subConnector}${dep.deps[j]}`);
      }
    }
  }

  return lines.join('\n');
}

export async function handleSendDepGraph(
  bot: Bot,
  args: {
    chat_id: string;
    root: string;
    dependencies: { name: string; deps?: string[] }[];
    reply_to?: number;
  }
): Promise<{ message_id: number; inline: boolean }> {
  const { chat_id, root, dependencies, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  const tree = renderDepGraph(root, dependencies);
  const body = `\`\`\`\n${tree}\n\`\`\``;

  if (body.length <= MAX_CHUNK_LIMIT) {
    const msg = await bot.api.sendMessage(chat_id, body, replyParams);
    return { message_id: msg.message_id, inline: true };
  }

  // Send as .txt document
  const tmpDir = tmpdir();
  mkdirSync(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, 'dep-graph.txt');
  writeFileSync(tmpPath, tree, 'utf-8');

  const inputFile = new InputFile(tmpPath, 'dep-graph.txt');
  const msg = await bot.api.sendDocument(chat_id, inputFile, {
    caption: `📦 ${root}`,
    ...replyParams,
  });

  return { message_id: msg.message_id, inline: false };
}
