import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StreamManager } from './stream/manager.js';
import { CallbackRegistry } from './bot/callbacks.js';
import { createBot } from './bot/index.js';
import { getToken } from './access/config.js';
import { INSTRUCTIONS } from './instructions.js';

// Tool schemas
import { replyToolSchema, handleReply } from './tools/reply.js';
import { reactToolSchema, handleReact } from './tools/react.js';
import { editMessageToolSchema, handleEditMessage } from './tools/edit-message.js';
import { downloadToolSchema, handleDownload } from './tools/download.js';
import { replyStreamToolSchema, handleReplyStream } from './tools/reply-stream.js';
import { sendButtonsToolSchema, handleSendButtons } from './tools/send-buttons.js';
import { updateTasksToolSchema, handleUpdateTasks } from './tools/update-tasks.js';
import { sendDiffToolSchema, handleSendDiff } from './tools/send-diff.js';
import { sendFileToolSchema, handleSendFile } from './tools/send-file.js';

const ALL_TOOLS = [
  replyToolSchema,
  reactToolSchema,
  editMessageToolSchema,
  downloadToolSchema,
  replyStreamToolSchema,
  sendButtonsToolSchema,
  updateTasksToolSchema,
  sendDiffToolSchema,
  sendFileToolSchema,
];

async function main() {
  const token = getToken();

  const mcp = new Server(
    { name: 'claude-code-telegram', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
        experimental: {
          'claude/channel': {},
        },
      },
      instructions: INSTRUCTIONS,
    }
  );

  const streamManager = new StreamManager();
  const callbackRegistry = new CallbackRegistry();
  const bot = createBot(token, mcp, callbackRegistry);

  // Register list tools handler
  mcp.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  // Register call tool handler
  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case 'reply':
          result = await handleReply(bot, safeArgs as Parameters<typeof handleReply>[1]);
          break;

        case 'react':
          result = await handleReact(bot, safeArgs as Parameters<typeof handleReact>[1]);
          break;

        case 'edit_message':
          result = await handleEditMessage(
            bot,
            safeArgs as Parameters<typeof handleEditMessage>[1]
          );
          break;

        case 'download':
          result = await handleDownload(
            bot,
            token,
            safeArgs as Parameters<typeof handleDownload>[2]
          );
          break;

        case 'reply_stream':
          result = await handleReplyStream(
            bot,
            streamManager,
            safeArgs as Parameters<typeof handleReplyStream>[2]
          );
          break;

        case 'send_buttons':
          result = await handleSendButtons(
            bot,
            callbackRegistry,
            safeArgs as Parameters<typeof handleSendButtons>[2]
          );
          break;

        case 'update_tasks':
          result = await handleUpdateTasks(
            bot,
            streamManager,
            safeArgs as Parameters<typeof handleUpdateTasks>[2]
          );
          break;

        case 'send_diff':
          result = await handleSendDiff(
            bot,
            safeArgs as Parameters<typeof handleSendDiff>[1]
          );
          break;

        case 'send_file':
          result = await handleSendFile(
            bot,
            safeArgs as Parameters<typeof handleSendFile>[1]
          );
          break;

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Start bot polling with 409 conflict retry loop
  async function startPolling(): Promise<void> {
    while (true) {
      try {
        await bot.start({
          onStart: (info) => {
            console.error(`[bot] Started as @${info.username}`);
          },
        });
        break;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('409') || message.includes('Conflict')) {
          console.error('[bot] 409 Conflict — another instance running, retrying in 5s...');
          await new Promise((r) => setTimeout(r, 5000));
        } else {
          console.error('[bot] Fatal polling error:', message);
          throw err;
        }
      }
    }
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[server] Shutting down...');
    try {
      await bot.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);

  // Start polling in background
  startPolling().catch((err) => {
    console.error('[bot] Polling failed:', err);
    process.exit(1);
  });

  // Connect MCP transport
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error('[mcp] Connected via stdio');
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
