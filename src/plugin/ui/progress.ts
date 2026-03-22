/**
 * Map a status/event string to an emoji icon.
 */
export function statusIcon(status: string): string {
  if (status === 'thinking') return '⏳';
  if (status === 'tool:Read') return '📄';
  if (status === 'tool:Edit') return '✏️';
  if (status === 'tool:Bash') return '🔧';
  if (status === 'tool:Write') return '📝';
  if (status === 'tool:Glob') return '🔍';
  if (status === 'tool:Grep') return '🔎';
  if (status.startsWith('tool:')) return '🛠️';
  if (status === 'done') return '✅';
  if (status === 'error') return '❌';
  if (status === 'streaming') return '💬';
  return '•';
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Internal helper.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
}

/**
 * Format a completion notification message.
 */
export function completionNotification(
  taskName: string,
  durationMs: number,
  tokens?: number
): string {
  const duration = formatDuration(durationMs);
  const tokenPart = tokens != null ? ` · ${tokens.toLocaleString()} tokens` : '';
  return `✅ **${taskName}** completed in ${duration}${tokenPart}`;
}
