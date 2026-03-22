import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

type Session = {
  pid: number
  workDir: string
  startedAt: number
  name: string
}

const STATE_FILE = join(homedir(), '.claude', 'channels', 'claude-code-telegram', 'sessions.json')

export class SessionManager {
  private current: ChildProcess | null = null
  private currentSession: Session | null = null

  async start(workDir: string, claudePath: string, channelPlugin: string): Promise<Session> {
    if (this.current) await this.stop()

    const child = spawn(claudePath, [
      '--channels', `plugin:${channelPlugin}`,
      '--permission-mode', 'auto',
    ], {
      cwd: workDir,
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_TG_DAEMON: '1' },
    })

    const session: Session = {
      pid: child.pid!,
      workDir,
      startedAt: Date.now(),
      name: workDir.split('/').pop() ?? workDir,
    }

    this.current = child
    this.currentSession = session
    this.saveState()

    child.on('exit', () => {
      this.current = null
      this.currentSession = null
    })

    return session
  }

  async stop(): Promise<void> {
    if (this.current) {
      this.current.kill('SIGTERM')
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { this.current?.kill('SIGKILL'); resolve() }, 5000)
        this.current?.on('exit', () => { clearTimeout(timer); resolve() })
      })
      this.current = null
      this.currentSession = null
    }
  }

  getActive(): Session | null { return this.currentSession }

  private saveState(): void {
    try {
      mkdirSync(join(homedir(), '.claude', 'channels', 'claude-code-telegram'), { recursive: true })
      writeFileSync(STATE_FILE, JSON.stringify(this.currentSession, null, 2))
    } catch {}
  }
}
