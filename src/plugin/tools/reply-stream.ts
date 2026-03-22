import type { Bot } from 'grammy';
import type { StreamManager } from '../stream/manager.js';
import { assertAllowedChat } from '../access/gate.js';
import { MAX_CHUNK_LIMIT } from '../access/config.js';
import { statusIcon } from '../ui/progress.js';

export const replyStreamToolSchema = {
  name: 'reply_stream',
  description:
    'Stream a live-updating message to Telegram. First call (no stream_id) sends a new message and returns a stream_id. Subsequent calls update that message in place. Call with status="done" to finalize.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      chat_id: { type: 'string', description: 'Telegram chat ID' },
      text: { type: 'string', description: 'Current text content' },
      stream_id: {
        type: 'string',
        description: 'Stream ID from a previous call (omit for first call)',
      },
      status: {
        type: 'string',
        description: 'Status label (e.g. "thinking", "tool:Read", "done", "error")',
      },
      reply_to: { type: 'number', description: 'Optional message ID to reply to' },
    },
    required: ['chat_id', 'text'],
  },
};

function buildContent(text: string, status: string | null): string {
  if (!status || status === 'done') return text;
  const icon = statusIcon(status);
  return `${icon} _${status}_\n\n${text}`;
}

export async function handleReplyStream(
  bot: Bot,
  streamManager: StreamManager,
  args: {
    chat_id: string;
    text: string;
    stream_id?: string;
    status?: string;
    reply_to?: number;
  }
): Promise<{ stream_id: string; message_id: number }> {
  const { chat_id, text, stream_id, status, reply_to } = args;
  assertAllowedChat(chat_id);

  const isDone = status === 'done';

  // First call: no stream_id → send initial message and create stream
  if (!stream_id) {
    const content = buildContent(text, status ?? null);
    const replyParams = reply_to
      ? { reply_parameters: { message_id: reply_to } }
      : {};
    const msg = await bot.api.sendMessage(chat_id, content, replyParams);
    const newStreamId = streamManager.create(chat_id, msg.message_id);
    streamManager.updateContent(newStreamId, content);
    if (status) streamManager.updateStatus(newStreamId, status);

    if (isDone) {
      streamManager.finish(newStreamId);
    }

    return { stream_id: newStreamId, message_id: msg.message_id };
  }

  // Subsequent call: update existing stream
  const stream = streamManager.get(stream_id);
  if (!stream) {
    // Stream not found — start a new message
    const content = buildContent(text, status ?? null);
    const replyParams = reply_to
      ? { reply_parameters: { message_id: reply_to } }
      : {};
    const msg = await bot.api.sendMessage(chat_id, content, replyParams);
    const newStreamId = streamManager.create(chat_id, msg.message_id);
    streamManager.updateContent(newStreamId, content);
    if (status) streamManager.updateStatus(newStreamId, status);
    if (isDone) streamManager.finish(newStreamId);
    return { stream_id: newStreamId, message_id: msg.message_id };
  }

  const finalContent = isDone ? text : buildContent(text, status ?? stream.status);

  // Check for overflow: if content > 4096, send a new message
  if (finalContent.length > MAX_CHUNK_LIMIT) {
    try {
      await bot.api.editMessageText(chat_id, stream.messageId, stream.buffer || '…');
    } catch {
      // ignore edit errors for overflow case
    }
    const overflowContent = buildContent(text, status ?? stream.status);
    const newMsg = await bot.api.sendMessage(chat_id, overflowContent);
    stream.messageId = newMsg.message_id;
    stream.buffer = overflowContent;
    if (status) streamManager.updateStatus(stream_id, status);
    if (isDone) streamManager.finish(stream_id);
    return { stream_id, message_id: newMsg.message_id };
  }

  // Try to edit existing message via throttle
  if (isDone || stream.throttle.shouldEdit(finalContent)) {
    try {
      await bot.api.editMessageText(chat_id, stream.messageId, finalContent);
      stream.throttle.markEdited(finalContent);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('message is not modified')) {
        // No-op: same content
      } else if (errMsg.includes('message to edit not found')) {
        // Send a new message
        const newMsg = await bot.api.sendMessage(chat_id, finalContent);
        stream.messageId = newMsg.message_id;
        stream.throttle.markEdited(finalContent);
      } else {
        throw err;
      }
    }
  }

  streamManager.updateContent(stream_id, finalContent);
  if (status) streamManager.updateStatus(stream_id, status);

  if (isDone) {
    streamManager.finish(stream_id);
  }

  return { stream_id, message_id: stream.messageId };
}
