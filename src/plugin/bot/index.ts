import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type { ReactionTypeEmoji } from '@grammyjs/types';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallbackRegistry } from './callbacks.js';
import { gate, loadAccess, saveAccess } from '../access/gate.js';
import { handleLocalCommand } from './commands.js';

async function handleInbound(
  bot: Bot,
  mcp: Server,
  ctx: Context,
  opts: {
    content: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
    meta: {
      chat_id: string;
      message_id: number;
      user: string;
      user_id: string;
      ts: number;
      image_path?: string;
      attachment_file_id?: string;
      attachment_name?: string;
      attachment_mime?: string;
      attachment_size?: number;
    };
  }
): Promise<void> {
  const { meta } = opts;
  const access = loadAccess();

  const chatType = ctx.chat?.type ?? 'private';
  const mentionedBot = opts.meta.user_id
    ? ctx.message?.entities?.some(
        (e) =>
          e.type === 'mention' &&
          ctx.message?.text?.slice(e.offset, e.offset + e.length) ===
            `@${ctx.me?.username}`
      ) ?? false
    : false;

  const result = gate(access, {
    senderId: meta.user_id,
    chatId: meta.chat_id,
    chatType,
    mentionedBot,
  });

  if (result.action === 'drop') return;

  if (result.action === 'pair') {
    const token = result.token;
    // Record pending entry
    const pending = access.pending ?? {};
    pending[token] = {
      senderId: meta.user_id,
      chatId: meta.chat_id,
      createdAt: meta.ts,
      expiresAt: meta.ts + 5 * 60 * 1000,
      replies: 0,
    };
    access.pending = pending;
    saveAccess(access);
    await bot.api.sendMessage(
      meta.chat_id,
      `🔑 Pairing code: \`${token}\`\n\nRun: \`claude mcp add telegram -- bun run start\` and enter this code when prompted.`,
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  // action === 'deliver'
  // Send typing action
  try {
    await bot.api.sendChatAction(meta.chat_id, 'typing');
  } catch {
    // ignore
  }

  // Ack reaction if configured
  if (access.ackReaction && meta.message_id) {
    try {
      await bot.api.setMessageReaction(meta.chat_id, meta.message_id, [
        { type: 'emoji', emoji: access.ackReaction as ReactionTypeEmoji['emoji'] },
      ]);
    } catch {
      // ignore
    }
  }

  // Check text content for local commands
  const textContent = opts.content.find((c) => c.type === 'text');
  const textStr = textContent?.type === 'text' ? textContent.text : '';
  if (textStr && ctx.message) {
    const handled = await handleLocalCommand(bot, ctx, textStr);
    if (handled) return;
  }

  // Forward to Claude via MCP notification
  try {
    await (mcp as unknown as {
      notification(n: { method: string; params: unknown }): Promise<void>;
    }).notification({
      method: 'notifications/claude/channel',
      params: {
        content: opts.content,
        meta: opts.meta,
      },
    });
  } catch (err) {
    // MCP client may not be connected yet; log and continue
    console.error('[bot] MCP notification error:', err);
  }
}

export function createBot(
  token: string,
  mcp: Server,
  callbackRegistry: CallbackRegistry
): Bot {
  const bot = new Bot(token);

  // Text messages
  bot.on('message:text', async (ctx) => {
    const chat_id = ctx.chat.id.toString();
    const message_id = ctx.message.message_id;
    const from = ctx.message.from;
    const user = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        from.id.toString()
      : 'unknown';
    const user_id = from?.id?.toString() ?? 'unknown';
    const ts = (ctx.message.date ?? Math.floor(Date.now() / 1000)) * 1000;
    const text = ctx.message.text;

    await handleInbound(bot, mcp, ctx, {
      content: [{ type: 'text', text }],
      meta: { chat_id, message_id, user, user_id, ts },
    });
  });

  // Photo messages
  bot.on('message:photo', async (ctx) => {
    const chat_id = ctx.chat.id.toString();
    const message_id = ctx.message.message_id;
    const from = ctx.message.from;
    const user = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        from.id.toString()
      : 'unknown';
    const user_id = from?.id?.toString() ?? 'unknown';
    const ts = (ctx.message.date ?? Math.floor(Date.now() / 1000)) * 1000;
    const caption = ctx.message.caption ?? '';

    // Get the largest photo
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];
    const file_id = photo?.file_id;

    await handleInbound(bot, mcp, ctx, {
      content: [{ type: 'text', text: caption }],
      meta: {
        chat_id,
        message_id,
        user,
        user_id,
        ts,
        attachment_file_id: file_id,
        attachment_mime: 'image/jpeg',
      },
    });
  });

  // Document messages
  bot.on('message:document', async (ctx) => {
    const chat_id = ctx.chat.id.toString();
    const message_id = ctx.message.message_id;
    const from = ctx.message.from;
    const user = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        from.id.toString()
      : 'unknown';
    const user_id = from?.id?.toString() ?? 'unknown';
    const ts = (ctx.message.date ?? Math.floor(Date.now() / 1000)) * 1000;
    const caption = ctx.message.caption ?? '';
    const doc = ctx.message.document;

    await handleInbound(bot, mcp, ctx, {
      content: [{ type: 'text', text: caption }],
      meta: {
        chat_id,
        message_id,
        user,
        user_id,
        ts,
        attachment_file_id: doc.file_id,
        attachment_name: doc.file_name,
        attachment_mime: doc.mime_type,
        attachment_size: doc.file_size,
      },
    });
  });

  // Callback queries (inline keyboard button presses)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id?.toString();
    const messageId = ctx.callbackQuery.message?.message_id;

    // Always answer the callback query to remove the loading indicator
    await ctx.answerCallbackQuery().catch(() => {});

    if (!chatId || !messageId) return;

    // Try registry (btn:<msgId>:<buttonId> format)
    const parsed = callbackRegistry.parseCallbackData(data);
    if (parsed) {
      callbackRegistry.handle(chatId, parsed.messageId, parsed.buttonId);
      return;
    }

    // cmd: prefix for menu commands
    if (data.startsWith('cmd:')) {
      const cmd = data.slice('cmd:'.length);
      if (ctx.message) {
        await handleLocalCommand(bot, ctx, cmd);
      } else {
        // Send as new message since we don't have a proper ctx.message
        await bot.api.sendMessage(chatId, `Running: ${cmd}`).catch(() => {});
      }
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error('[bot] Error:', err.message ?? err);
  });

  return bot;
}
