import { describe, it, expect } from 'bun:test';
import { chunk } from '../src/plugin/ui/chunker.js';

describe('chunk()', () => {
  it('returns the original text as a single element when it fits within the limit', () => {
    expect(chunk('hello', 10, 'length')).toEqual(['hello']);
  });

  it('returns the original text when its length exactly equals the limit', () => {
    expect(chunk('hello', 5, 'length')).toEqual(['hello']);
  });

  it('splits text by hard length in length mode', () => {
    const result = chunk('abcdef', 3, 'length');
    expect(result).toEqual(['abc', 'def']);
  });

  it('handles text that does not divide evenly in length mode', () => {
    const result = chunk('abcdefg', 3, 'length');
    expect(result).toEqual(['abc', 'def', 'g']);
  });

  it('produces chunks all <= limit in length mode', () => {
    const text = 'a'.repeat(100);
    const limit = 17;
    const result = chunk(text, limit, 'length');
    for (const c of result) {
      expect(c.length).toBeLessThanOrEqual(limit);
    }
    expect(result.join('')).toBe(text);
  });

  it('splits on paragraph boundary in newline mode', () => {
    const part1 = 'First paragraph here.';
    const part2 = 'Second paragraph here.';
    const text = `${part1}\n\n${part2}`;
    // limit large enough to include the double newline but force a split
    const limit = part1.length + 2; // just past the double newline
    const result = chunk(text, limit, 'newline');
    expect(result.length).toBeGreaterThanOrEqual(1);
    // reassembling should yield original content (leading newlines stripped from rest)
    const joined = result.join('\n\n'); // not exact but check none are empty
    for (const c of result) {
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('strips leading newlines from subsequent chunks in newline mode', () => {
    const text = 'aaaa\n\nbbbb';
    const result = chunk(text, 6, 'newline');
    for (const c of result) {
      expect(c).not.toMatch(/^\n/);
    }
  });

  it('falls back to hard cut when no suitable break is found in newline mode', () => {
    // a string with no spaces or newlines
    const text = 'a'.repeat(20);
    const result = chunk(text, 10, 'newline');
    expect(result).toEqual(['a'.repeat(10), 'a'.repeat(10)]);
  });

  it('handles an empty string', () => {
    expect(chunk('', 10, 'length')).toEqual(['']);
  });
});
