import { describe, it, expect } from 'bun:test';
import { CallbackRegistry } from '../src/plugin/bot/callbacks.js';

describe('CallbackRegistry — encodeCallbackData / parseCallbackData', () => {
  it('encodes and parses back correctly', () => {
    const reg = new CallbackRegistry();
    const data = reg.encodeCallbackData(123, 'yes');
    expect(data).toBe('btn:123:yes');
    const parsed = reg.parseCallbackData(data);
    expect(parsed).not.toBeNull();
    expect(parsed?.messageId).toBe(123);
    expect(parsed?.buttonId).toBe('yes');
  });

  it('encodes to at most 64 characters', () => {
    const reg = new CallbackRegistry();
    const data = reg.encodeCallbackData(999, 'short');
    expect(data.length).toBeLessThanOrEqual(64);
  });

  it('throws when encoded data would exceed 64 chars', () => {
    const reg = new CallbackRegistry();
    const longId = 'x'.repeat(60);
    expect(() => reg.encodeCallbackData(1, longId)).toThrow();
  });

  it('parseCallbackData returns null for unknown format', () => {
    const reg = new CallbackRegistry();
    expect(reg.parseCallbackData('random:stuff')).toBeNull();
    expect(reg.parseCallbackData('')).toBeNull();
    expect(reg.parseCallbackData('btn:notanumber:x')).toBeNull();
  });

  it('round-trips with buttonId containing colons', () => {
    const reg = new CallbackRegistry();
    const data = reg.encodeCallbackData(1, 'a:b');
    const parsed = reg.parseCallbackData(data);
    expect(parsed?.buttonId).toBe('a:b');
  });
});

describe('CallbackRegistry — register and handle', () => {
  it('resolves the promise with the selected buttonId on handle()', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'Yes', id: 'yes' }, { text: 'No', id: 'no' }];
    const promise = reg.register('chat1', 1, buttons);
    const handled = reg.handle('chat1', 1, 'yes');
    expect(handled).toBe(true);
    const result = await promise;
    expect(result).toBe('yes');
  });

  it('returns false when handle() finds no matching callback', () => {
    const reg = new CallbackRegistry();
    const handled = reg.handle('chat1', 999, 'yes');
    expect(handled).toBe(false);
  });

  it('handle() resolves only once (second call returns false)', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'OK', id: 'ok' }];
    const promise = reg.register('chat1', 1, buttons);
    reg.handle('chat1', 1, 'ok');
    await promise; // drain
    const second = reg.handle('chat1', 1, 'ok');
    expect(second).toBe(false);
  });
});

describe('CallbackRegistry — cancelForChat', () => {
  it('cancels pending callbacks for the given chatId', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'OK', id: 'ok' }];
    const promise = reg.register('chat1', 1, buttons);
    reg.cancelForChat('chat1');
    const result = await promise;
    expect(result).toBe('__cancelled__');
  });

  it('cancels with a custom reason', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'OK', id: 'ok' }];
    const promise = reg.register('chat1', 1, buttons);
    reg.cancelForChat('chat1', '__custom__');
    const result = await promise;
    expect(result).toBe('__custom__');
  });

  it('does not cancel callbacks for a different chatId', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'OK', id: 'ok' }];
    const promise = reg.register('chat1', 1, buttons);
    reg.cancelForChat('chat2');
    // Resolve it properly
    reg.handle('chat1', 1, 'ok');
    const result = await promise;
    expect(result).toBe('ok');
  });
});

describe('CallbackRegistry — cancel on re-register', () => {
  it('cancels the previous promise when a new one is registered for the same chatId', async () => {
    const reg = new CallbackRegistry();
    const buttons = [{ text: 'OK', id: 'ok' }];
    const first = reg.register('chat1', 1, buttons);
    const second = reg.register('chat1', 2, buttons);

    // First should resolve with __cancelled__
    const firstResult = await first;
    expect(firstResult).toBe('__cancelled__');

    // Resolve second normally
    reg.handle('chat1', 2, 'ok');
    const secondResult = await second;
    expect(secondResult).toBe('ok');
  });
});
