import { describe, it, expect } from 'bun:test';
import { EditThrottle } from '../src/plugin/stream/throttle.js';

describe('EditThrottle', () => {
  it('allows the first edit (no prior edit)', () => {
    const throttle = new EditThrottle(1000);
    expect(throttle.shouldEdit('hello')).toBe(true);
  });

  it('disallows edit when content is unchanged', () => {
    const throttle = new EditThrottle(0); // interval = 0 so time is not the constraint
    throttle.markEdited('hello');
    expect(throttle.shouldEdit('hello')).toBe(false);
  });

  it('disallows edit when interval has not passed', () => {
    const throttle = new EditThrottle(10_000); // 10 seconds
    throttle.markEdited('old content');
    expect(throttle.shouldEdit('new content')).toBe(false);
  });

  it('allows edit when interval has passed and content changed', async () => {
    const throttle = new EditThrottle(10); // 10ms
    throttle.markEdited('old content');
    await new Promise((r) => setTimeout(r, 20)); // wait longer than interval
    expect(throttle.shouldEdit('new content')).toBe(true);
  });

  it('markEdited updates tracked content', () => {
    const throttle = new EditThrottle(0);
    throttle.markEdited('v1');
    expect(throttle.shouldEdit('v1')).toBe(false);
    throttle.markEdited('v2');
    expect(throttle.shouldEdit('v1')).toBe(true); // v1 != v2, and interval=0
  });

  it('reset() clears state so next shouldEdit returns true', async () => {
    const throttle = new EditThrottle(10_000);
    throttle.markEdited('content');
    throttle.reset();
    // After reset, interval check: lastEditTime is 0 → elapsed is huge → passes
    expect(throttle.shouldEdit('content')).toBe(true);
  });

  it('markEdited without content argument does not change lastContent', () => {
    const throttle = new EditThrottle(0);
    throttle.markEdited('original');
    throttle.markEdited(); // no content argument
    // content still 'original', so shouldEdit('original') → same content → false
    expect(throttle.shouldEdit('original')).toBe(false);
  });
});
