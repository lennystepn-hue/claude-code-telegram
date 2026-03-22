import type { ButtonCallback } from '../types.js';
import { BUTTON_TIMEOUT_MS } from '../access/config.js';

type PendingCallback = ButtonCallback;

export class CallbackRegistry {
  private pending: Map<string, PendingCallback> = new Map();

  /**
   * Encode a callback data string for an inline button.
   * Format: btn:<msgId>:<buttonId>  (max 64 chars — Telegram limit)
   */
  encodeCallbackData(messageId: number, buttonId: string): string {
    const data = `btn:${messageId}:${buttonId}`;
    if (data.length > 64) {
      throw new Error(`Callback data too long (${data.length} chars): ${data}`);
    }
    return data;
  }

  /**
   * Parse a callback data string back into its components.
   * Returns null if the format is not recognised.
   */
  parseCallbackData(data: string): { messageId: number; buttonId: string } | null {
    const match = data.match(/^btn:(\d+):(.+)$/);
    if (!match) return null;
    return { messageId: parseInt(match[1], 10), buttonId: match[2] };
  }

  /**
   * Register buttons for a message.  If there is already a pending callback for
   * the same chatId it is cancelled first.  Returns a Promise that resolves with
   * the selected buttonId, '__timeout__', or '__cancelled__'.
   */
  register(
    chatId: string,
    messageId: number,
    buttons: Array<{ text: string; id: string }>
  ): Promise<string> {
    // Cancel any existing pending callback for this chat
    this.cancelForChat(chatId, '__cancelled__');

    return new Promise<string>((resolve) => {
      const expiresAt = Date.now() + BUTTON_TIMEOUT_MS;

      const entry: PendingCallback = {
        resolve,
        buttons,
        messageId,
        chatId,
        expiresAt,
      };

      const key = this.key(chatId, messageId);
      this.pending.set(key, entry);

      // Auto-resolve on timeout
      setTimeout(() => {
        const current = this.pending.get(key);
        if (current && current.resolve === resolve) {
          this.pending.delete(key);
          resolve('__timeout__');
        }
      }, BUTTON_TIMEOUT_MS);
    });
  }

  /**
   * Handle an incoming callback query.  Returns true if the callback was found
   * and resolved, false if no matching pending callback exists.
   */
  handle(chatId: string, messageId: number, buttonId: string): boolean {
    const key = this.key(chatId, messageId);
    const entry = this.pending.get(key);
    if (!entry) return false;
    this.pending.delete(key);
    entry.resolve(buttonId);
    return true;
  }

  /**
   * Cancel all pending callbacks for a given chatId, optionally with a reason.
   */
  cancelForChat(chatId: string, reason = '__cancelled__'): void {
    for (const [key, entry] of this.pending.entries()) {
      if (entry.chatId === chatId) {
        this.pending.delete(key);
        entry.resolve(reason);
      }
    }
  }

  // ---------- private ----------

  private key(chatId: string, messageId: number): string {
    return `${chatId}:${messageId}`;
  }
}
