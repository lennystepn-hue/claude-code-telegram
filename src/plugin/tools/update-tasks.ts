import type { Bot } from 'grammy';
import type { StreamManager } from '../stream/manager.js';
import type { TaskItem } from '../types.js';
import { assertAllowedChat } from '../access/gate.js';
import { formatTaskList } from '../ui/format.js';

export const updateTasksToolSchema = {
  name: 'update_tasks',
  description:
    'Send or live-update a task list in a Telegram chat. Pass stream_id to update an existing task message.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      tasks: {
        type: 'array',
        description: 'List of tasks',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
            },
          },
          required: ['name', 'status'],
        },
      },
      title: { type: 'string', description: 'Optional title for the task list' },
      stream_id: {
        type: 'string',
        description: 'Stream ID to live-edit an existing task message',
      },
    },
    required: ['chat_id', 'tasks'],
  },
};

export async function handleUpdateTasks(
  bot: Bot,
  streamManager: StreamManager,
  args: {
    chat_id: string;
    tasks: TaskItem[];
    title?: string;
    stream_id?: string;
  }
): Promise<{ stream_id: string; message_id: number }> {
  const { chat_id, tasks, title, stream_id } = args;
  assertAllowedChat(chat_id);

  const rendered = formatTaskList(tasks, title);

  if (stream_id) {
    const stream = streamManager.get(stream_id);
    if (stream) {
      if (stream.throttle.shouldEdit(rendered)) {
        try {
          await bot.api.editMessageText(chat_id, stream.messageId, rendered);
          stream.throttle.markEdited(rendered);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (!errMsg.includes('message is not modified')) throw err;
        }
      }
      streamManager.updateContent(stream_id, rendered);
      return { stream_id, message_id: stream.messageId };
    }
  }

  // No stream or stream not found: send a new message
  const msg = await bot.api.sendMessage(chat_id, rendered);
  const newStreamId = streamManager.create(chat_id, msg.message_id);
  streamManager.updateContent(newStreamId, rendered);
  return { stream_id: newStreamId, message_id: msg.message_id };
}
