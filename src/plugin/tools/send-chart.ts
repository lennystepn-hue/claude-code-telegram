import type { Bot } from 'grammy';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';

export const sendChartToolSchema = {
  name: 'send_chart',
  description:
    'Send a simple text-based bar chart to Telegram using Unicode block characters.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      title: { type: 'string', description: 'Chart title' },
      data: {
        type: 'array',
        description: 'Data points for the chart',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Bar label' },
            value: { type: 'number', description: 'Numeric value' },
          },
          required: ['label', 'value'],
        },
      },
      chart_type: {
        type: 'string',
        enum: ['bar', 'horizontal_bar'],
        description: 'Chart type (default: horizontal_bar)',
      },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'title', 'data'],
  },
};

function renderHorizontalBar(
  title: string,
  data: { label: string; value: number }[]
): string {
  const BAR_WIDTH = 10;
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const maxLabel = Math.max(...data.map((d) => d.label.length), 1);

  const lines: string[] = [];
  lines.push(`📊 ${title}`);
  lines.push('━'.repeat(Math.min(title.length + 3, 32)));

  for (const { label, value } of data) {
    const filled = Math.round((value / maxValue) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const pct = maxValue === 0 ? 0 : Math.round((value / maxValue) * 100);
    const paddedLabel = label.padEnd(maxLabel);
    lines.push(`${paddedLabel}  ${bar} ${pct}%`);
  }

  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

export async function handleSendChart(
  bot: Bot,
  args: {
    chat_id: string;
    title: string;
    data: { label: string; value: number }[];
    chart_type?: 'bar' | 'horizontal_bar';
    reply_to?: number;
  }
): Promise<{ message_id: number }> {
  const { chat_id, title, data, reply_to } = args;
  assertAllowedChat(chat_id);

  const replyParams = reply_to
    ? { reply_parameters: { message_id: reply_to } }
    : {};

  // Both 'bar' and 'horizontal_bar' render the same horizontal text chart
  const rendered = renderHorizontalBar(title, data);

  const text = rendered.length <= MAX_CHUNK_LIMIT ? rendered : rendered.slice(0, MAX_CHUNK_LIMIT);

  const msg = await bot.api.sendMessage(chat_id, text, replyParams);
  return { message_id: msg.message_id };
}
