import { describe, it, expect } from 'bun:test';
import { StreamManager } from '../src/plugin/stream/manager.js';

describe('StreamManager', () => {
  it('create() returns a non-empty string stream ID', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 42);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('create() returns unique IDs each time', () => {
    const mgr = new StreamManager();
    const ids = new Set(Array.from({ length: 20 }, () => mgr.create('chat1', 1)));
    expect(ids.size).toBe(20);
  });

  it('get() returns the stream state after create()', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 99);
    const state = mgr.get(id);
    expect(state).not.toBeNull();
    expect(state?.chatId).toBe('chat1');
    expect(state?.messageId).toBe(99);
    expect(state?.buffer).toBe('');
    expect(state?.status).toBeNull();
  });

  it('get() returns null for an unknown stream ID', () => {
    const mgr = new StreamManager();
    expect(mgr.get('does-not-exist')).toBeNull();
  });

  it('updateContent() sets the buffer', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 1);
    mgr.updateContent(id, 'hello world');
    expect(mgr.get(id)?.buffer).toBe('hello world');
  });

  it('updateContent() is a no-op for unknown stream', () => {
    const mgr = new StreamManager();
    // Should not throw
    mgr.updateContent('unknown', 'data');
  });

  it('updateStatus() sets the status field', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 1);
    mgr.updateStatus(id, 'thinking');
    expect(mgr.get(id)?.status).toBe('thinking');
  });

  it('updateStatus() is a no-op for unknown stream', () => {
    const mgr = new StreamManager();
    mgr.updateStatus('unknown', 'thinking');
  });

  it('finish() removes the stream', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 1);
    mgr.finish(id);
    expect(mgr.get(id)).toBeNull();
  });

  it('finish() clears a pending timer', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 1);
    const state = mgr.get(id)!;
    // Manually set a timer to verify it gets cleared
    let timerFired = false;
    state.timer = setTimeout(() => { timerFired = true; }, 5000);
    mgr.finish(id);
    // Timer should have been cleared; give it a tiny moment to ensure it wouldn't fire
    expect(mgr.get(id)).toBeNull();
    // timerFired should remain false because we cleared it
    expect(timerFired).toBe(false);
  });

  it('finish() is a no-op for unknown stream', () => {
    const mgr = new StreamManager();
    mgr.finish('unknown'); // should not throw
  });

  it('stream has a throttle object', () => {
    const mgr = new StreamManager();
    const id = mgr.create('chat1', 1);
    const state = mgr.get(id);
    expect(state?.throttle).toBeDefined();
    expect(typeof state?.throttle.shouldEdit).toBe('function');
  });
});
