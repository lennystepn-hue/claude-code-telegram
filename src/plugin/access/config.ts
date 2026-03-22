import { readFileSync } from 'fs';
import { join } from 'path';

export const STATE_DIR =
  process.env.TELEGRAM_STATE_DIR ??
  join(process.env.HOME ?? '~', '.claude', 'channels', 'claude-code-telegram');

export const ACCESS_FILE = join(STATE_DIR, 'access.json');
export const APPROVED_DIR = join(STATE_DIR, 'approved');
export const ENV_FILE = join(STATE_DIR, '.env');
export const INBOX_DIR = join(STATE_DIR, 'inbox');

export const MAX_CHUNK_LIMIT = 4096;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB
export const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export const STREAM_EDIT_INTERVAL_MS = 1000;
export const BUTTON_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function getToken(): string {
  const fromEnv = process.env.TELEGRAM_BOT_TOKEN;
  if (fromEnv) return fromEnv;

  try {
    const contents = readFileSync(ENV_FILE, 'utf-8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TELEGRAM_BOT_TOKEN=')) {
        return trimmed.slice('TELEGRAM_BOT_TOKEN='.length).trim();
      }
    }
  } catch {
    // file may not exist yet
  }

  throw new Error(
    `TELEGRAM_BOT_TOKEN not found in environment or ${ENV_FILE}`
  );
}
