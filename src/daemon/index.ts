import { getToken } from '../plugin/access/config.js'
import { SessionManager } from './session-manager.js'
import { createDaemonBot } from './bot.js'

async function main() {
  const token = getToken()
  const sessions = new SessionManager()
  const bot = createDaemonBot(token, sessions)

  const shutdown = async () => {
    console.error('[daemon] Shutting down...')
    try {
      await sessions.stop()
      await bot.stop()
    } catch {
      // ignore
    }
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.error('[daemon] Starting bot polling...')
  await bot.start({
    onStart: (info) => {
      console.error(`[daemon] Running as @${info.username}`)
    },
  })
}

main().catch((err) => {
  console.error('[daemon] Fatal error:', err)
  process.exit(1)
})
