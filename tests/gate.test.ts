import { describe, it, expect } from 'bun:test';
import { gate } from '../src/plugin/access/gate.js';
import type { Access } from '../src/plugin/types.js';

const BASE_ACCESS: Access = {
  dmPolicy: 'pairing',
  allowFrom: [],
  groups: {},
  pending: {},
};

function ctx(overrides: Partial<{ senderId: string; chatId: string; chatType: string; mentionedBot: boolean }>) {
  return {
    senderId: 'user1',
    chatId: 'chat1',
    chatType: 'private',
    ...overrides,
  };
}

describe('gate() — disabled policy', () => {
  it('drops all private messages when dmPolicy is disabled', () => {
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'disabled' };
    const result = gate(access, ctx({ chatType: 'private' }));
    expect(result.action).toBe('drop');
  });
});

describe('gate() — allowlist', () => {
  it('delivers to an allowlisted sender in a private chat', () => {
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'allowlist', allowFrom: ['user1'] };
    const result = gate(access, ctx({ senderId: 'user1', chatType: 'private' }));
    expect(result.action).toBe('deliver');
  });

  it('drops a non-allowlisted sender when dmPolicy is allowlist', () => {
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'allowlist', allowFrom: ['other'] };
    const result = gate(access, ctx({ senderId: 'user1', chatType: 'private' }));
    expect(result.action).toBe('drop');
  });

  it('delivers allowlisted sender regardless of dmPolicy value', () => {
    // Even in pairing mode, if sender is in allowFrom → deliver
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'pairing', allowFrom: ['user1'] };
    const result = gate(access, ctx({ senderId: 'user1', chatType: 'private' }));
    expect(result.action).toBe('deliver');
  });
});

describe('gate() — pairing mode', () => {
  it('generates a pairing token for an unknown sender in pairing mode', () => {
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'pairing', allowFrom: [] };
    const result = gate(access, ctx({ senderId: 'unknown', chatType: 'private' }));
    expect(result.action).toBe('pair');
    if (result.action === 'pair') {
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    }
  });

  it('generates a different token each call', () => {
    const access: Access = { ...BASE_ACCESS, dmPolicy: 'pairing', allowFrom: [] };
    const r1 = gate(access, ctx({ senderId: 'unknown', chatType: 'private' }));
    const r2 = gate(access, ctx({ senderId: 'unknown', chatType: 'private' }));
    if (r1.action === 'pair' && r2.action === 'pair') {
      // Very unlikely to collide with 3-byte random token
      expect(r1.token).not.toBe(r2.token);
    }
  });
});

describe('gate() — groups', () => {
  it('drops messages from groups with no registered policy', () => {
    const access: Access = { ...BASE_ACCESS, groups: {} };
    const result = gate(access, ctx({ chatId: 'grp1', chatType: 'group' }));
    expect(result.action).toBe('drop');
  });

  it('delivers to a group that has a policy and no mention requirement', () => {
    const access: Access = {
      ...BASE_ACCESS,
      groups: { grp1: { requireMention: false, allowFrom: [] } },
    };
    const result = gate(access, ctx({ chatId: 'grp1', chatType: 'group', mentionedBot: false }));
    expect(result.action).toBe('deliver');
  });

  it('drops when group requires mention and bot was not mentioned', () => {
    const access: Access = {
      ...BASE_ACCESS,
      groups: { grp1: { requireMention: true, allowFrom: [] } },
    };
    const result = gate(access, ctx({ chatId: 'grp1', chatType: 'group', mentionedBot: false }));
    expect(result.action).toBe('drop');
  });

  it('delivers when group requires mention and bot was mentioned', () => {
    const access: Access = {
      ...BASE_ACCESS,
      groups: { grp1: { requireMention: true, allowFrom: [] } },
    };
    const result = gate(access, ctx({ chatId: 'grp1', chatType: 'group', mentionedBot: true }));
    expect(result.action).toBe('deliver');
  });

  it('drops when sender is not in group allowFrom list', () => {
    const access: Access = {
      ...BASE_ACCESS,
      groups: { grp1: { requireMention: false, allowFrom: ['admin'] } },
    };
    const result = gate(access, ctx({ senderId: 'user1', chatId: 'grp1', chatType: 'group' }));
    expect(result.action).toBe('drop');
  });

  it('delivers when sender is in group allowFrom list', () => {
    const access: Access = {
      ...BASE_ACCESS,
      groups: { grp1: { requireMention: false, allowFrom: ['user1'] } },
    };
    const result = gate(access, ctx({ senderId: 'user1', chatId: 'grp1', chatType: 'group' }));
    expect(result.action).toBe('deliver');
  });
});

describe('gate() — unknown chat type', () => {
  it('drops messages from unknown chat types', () => {
    const access: Access = { ...BASE_ACCESS };
    const result = gate(access, ctx({ chatType: 'channel' }));
    expect(result.action).toBe('drop');
  });
});
