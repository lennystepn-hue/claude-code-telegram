export class EditThrottle {
  private lastEditTime = 0;
  private lastContent = '';
  private intervalMs: number;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  /**
   * Returns true if an edit should be sent — i.e. the content has changed
   * AND enough time has passed since the last edit.
   */
  shouldEdit(newContent: string): boolean {
    if (newContent === this.lastContent) return false;
    const now = Date.now();
    if (now - this.lastEditTime < this.intervalMs) return false;
    return true;
  }

  /**
   * Record that an edit was performed, optionally updating the tracked content.
   */
  markEdited(content?: string): void {
    this.lastEditTime = Date.now();
    if (content !== undefined) {
      this.lastContent = content;
    }
  }

  reset(): void {
    this.lastEditTime = 0;
    this.lastContent = '';
  }
}
