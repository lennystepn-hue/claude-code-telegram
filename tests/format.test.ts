import { describe, it, expect } from 'bun:test';
import {
  escapeMarkdownV2,
  formatHeader,
  formatCodeBlock,
  formatDiff,
  formatTaskList,
} from '../src/plugin/ui/format.js';
import type { TaskItem } from '../src/plugin/types.js';

describe('escapeMarkdownV2()', () => {
  it('escapes all Telegram MarkdownV2 special characters', () => {
    const specials = '_*[]()~`>#+\\-=|{}.!';
    const result = escapeMarkdownV2(specials);
    // every character should be preceded by a backslash
    for (const ch of specials) {
      expect(result).toContain(`\\${ch}`);
    }
  });

  it('does not alter plain text with no special chars', () => {
    expect(escapeMarkdownV2('hello world')).toBe('hello world');
  });

  it('escapes a realistic message', () => {
    const input = 'File saved: /tmp/foo.txt (100%)';
    const result = escapeMarkdownV2(input);
    expect(result).toContain('\\.');
    expect(result).toContain('\\(');
    expect(result).toContain('\\)');
  });
});

describe('formatHeader()', () => {
  it('returns the expected format', () => {
    expect(formatHeader('myproject', 'main', 'claude-3-5')).toBe(
      '[myproject | main | claude-3-5]'
    );
  });

  it('includes all three fields', () => {
    const result = formatHeader('proj', 'feat/x', 'model');
    expect(result).toContain('proj');
    expect(result).toContain('feat/x');
    expect(result).toContain('model');
  });
});

describe('formatCodeBlock()', () => {
  it('wraps code in triple backticks without a language', () => {
    const result = formatCodeBlock('const x = 1;');
    expect(result).toBe('```\nconst x = 1;\n```');
  });

  it('includes the language identifier when provided', () => {
    const result = formatCodeBlock('const x = 1;', 'typescript');
    expect(result).toBe('```typescript\nconst x = 1;\n```');
  });
});

describe('formatDiff()', () => {
  it('includes the filename and a diff code block', () => {
    const result = formatDiff('src/index.ts', '+added line\n-removed line');
    expect(result).toContain('src/index.ts');
    expect(result).toContain('```diff');
    expect(result).toContain('+added line');
    expect(result).toContain('-removed line');
  });

  it('includes a separator line', () => {
    const result = formatDiff('file.ts', 'diff content');
    const lines = result.split('\n');
    // separator is line 2 (index 1)
    expect(lines[1]).toMatch(/^─+$/);
  });
});

describe('formatTaskList()', () => {
  const tasks: TaskItem[] = [
    { name: 'Write tests', status: 'completed' },
    { name: 'Implement feature', status: 'in_progress' },
    { name: 'Deploy', status: 'pending' },
  ];

  it('includes task names', () => {
    const result = formatTaskList(tasks);
    expect(result).toContain('Write tests');
    expect(result).toContain('Implement feature');
    expect(result).toContain('Deploy');
  });

  it('uses correct icons for each status', () => {
    const result = formatTaskList(tasks);
    expect(result).toContain('✅');
    expect(result).toContain('⏳');
    expect(result).toContain('⬚');
  });

  it('includes a progress bar', () => {
    const result = formatTaskList(tasks);
    // Progress bar contains block characters
    expect(result).toMatch(/[█░▒]/);
  });

  it('includes the title when provided', () => {
    const result = formatTaskList(tasks, 'My Tasks');
    expect(result).toContain('My Tasks');
  });

  it('omits the title line when no title provided', () => {
    const result = formatTaskList(tasks);
    expect(result).not.toContain('**');
  });

  it('shows correct done/total count', () => {
    const result = formatTaskList(tasks);
    expect(result).toContain('1/3');
  });

  it('handles all-completed tasks', () => {
    const allDone: TaskItem[] = [
      { name: 'A', status: 'completed' },
      { name: 'B', status: 'completed' },
    ];
    const result = formatTaskList(allDone);
    expect(result).toContain('2/2');
    // Progress bar should be fully filled
    expect(result).toContain('██████████');
  });
});
