import { Bot, InlineKeyboard } from 'grammy'
import type { SessionManager } from './session-manager.js'

export function createDaemonBot(token: string, sessions: SessionManager): Bot {
  const bot = new Bot(token)

  bot.command('sessions', async (ctx) => {
    const active = sessions.getActive()
    const chatId = ctx.chat.id.toString()

    if (!active) {
      const keyboard = new InlineKeyboard().text('+ New Session', 'daemon:new')
      await bot.api.sendMessage(chatId, 'No active session.', {
        reply_markup: keyboard,
      })
      return
    }

    const uptime = Math.floor((Date.now() - active.startedAt) / 1000)
    const minutes = Math.floor(uptime / 60)
    const seconds = uptime % 60
    const uptimeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    const text =
      `Active session: ${active.name}\n` +
      `Directory: ${active.workDir}\n` +
      `PID: ${active.pid}\n` +
      `Uptime: ${uptimeStr}`

    const keyboard = new InlineKeyboard()
      .text('Stop', 'daemon:stop')
      .text('+ New', 'daemon:new')

    await bot.api.sendMessage(chatId, text, { reply_markup: keyboard })
  })

  bot.command('stop', async (ctx) => {
    const chatId = ctx.chat.id.toString()
    const active = sessions.getActive()
    if (!active) {
      await bot.api.sendMessage(chatId, 'No active session to stop.')
      return
    }
    await sessions.stop()
    await bot.api.sendMessage(chatId, `Stopped session: ${active.name}`)
  })

  bot.command('new', async (ctx) => {
    const chatId = ctx.chat.id.toString()
    const args = ctx.match
    const workDir = args?.trim() || process.cwd()
    const claudePath = process.env.CLAUDE_PATH ?? 'claude'
    const pluginPath = process.env.CLAUDE_TG_PLUGIN ?? 'claude-code-telegram'

    try {
      const session = await sessions.start(workDir, claudePath, pluginPath)
      await bot.api.sendMessage(
        chatId,
        `Started session: ${session.name}\nDirectory: ${session.workDir}\nPID: ${session.pid}`
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      await bot.api.sendMessage(chatId, `Failed to start session: ${message}`)
    }
  })

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data
    const chatId = ctx.chat?.id?.toString()

    await ctx.answerCallbackQuery().catch(() => {})

    if (!chatId) return

    if (data === 'daemon:stop') {
      const active = sessions.getActive()
      if (!active) {
        await bot.api.sendMessage(chatId, 'No active session.')
        return
      }
      await sessions.stop()
      await bot.api.sendMessage(chatId, `Stopped session: ${active.name}`)
      return
    }

    if (data === 'daemon:new') {
      await bot.api.sendMessage(
        chatId,
        'Send: /new <path>\n\nExample: /new /home/user/myproject'
      )
      return
    }
  })

  bot.catch((err) => {
    console.error('[daemon-bot] Error:', err.message ?? err)
  })

  return bot
}
