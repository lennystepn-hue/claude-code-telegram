import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StreamManager } from './stream/manager.js';
import { CallbackRegistry } from './bot/callbacks.js';
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
      },
      instructions: INSTRUCTIONS,
    }
  );

  const streamManager = new StreamManager();
  const callbackRegistry = new CallbackRegistry();

  // We run as a companion MCP plugin alongside the official telegram channel.
  // The official plugin handles polling/inbound. We only use the Bot for
  // outbound API calls (sendMessage, editMessage, etc.) — NO polling.
  const { Bot } = await import('grammy');
  const bot = new Bot(token);

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

  // Graceful shutdown
  process.on('SIGTERM', () => process.exit(0));
  process.stdin.on('close', () => process.exit(0));

  // Connect MCP transport (no bot polling — official plugin handles that)
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error('[mcp] Connected via stdio');
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
