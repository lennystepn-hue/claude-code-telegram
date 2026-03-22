import type { TaskItem } from '../types.js';

// Characters that must be escaped in Telegram MarkdownV2
const MDV2_SPECIAL = /([_*[\]()~`>#+\-=|{}.!\\])/g;

/**
 * Escape special characters for Telegram MarkdownV2.
 * Does NOT double-escape already-escaped sequences.
 */
export function escapeMarkdownV2(text: string): string {
  // Split on already-escaped sequences so we don't double-escape
  return text.replace(MDV2_SPECIAL, '\\$1');
}

/**
 * Format a header line: [project | branch | model]
 */
export function formatHeader(project: string, branch: string, model: string): string {
  return `[${project} | ${branch} | ${model}]`;
}

/**
 * Wrap code in a triple-backtick code block.
 */
export function formatCodeBlock(code: string, language?: string): string {
  const lang = language ?? '';
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Format a diff: filename header + separator + code block.
 */
export function formatDiff(file: string, diff: string): string {
  const header = `📄 ${file}`;
  const separator = '─'.repeat(Math.min(file.length + 3, 40));
  return `${header}\n${separator}\n${formatCodeBlock(diff, 'diff')}`;
}

const TASK_ICONS: Record<TaskItem['status'], string> = {
  completed: '✅',
  in_progress: '⏳',
  pending: '⬚',
};

/**
 * Render a task list with icons and a simple ASCII progress bar.
 */
export function formatTaskList(tasks: TaskItem[], title?: string): string {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;

  // Build progress bar: filled = completed, half = in_progress, empty = pending
  const barWidth = 10;
  const filledCount = Math.round((done / (total || 1)) * barWidth);
  const halfCount = inProgress > 0 && filledCount < barWidth ? 1 : 0;
  const emptyCount = barWidth - filledCount - halfCount;
  const bar =
    '█'.repeat(filledCount) + (halfCount ? '▒' : '') + '░'.repeat(emptyCount);

  const lines: string[] = [];
  if (title) lines.push(`**${title}**`);
  lines.push(`[${bar}] ${done}/${total}`);
  lines.push('');
  for (const task of tasks) {
    lines.push(`${TASK_ICONS[task.status]} ${task.name}`);
  }
  return lines.join('\n');
}
