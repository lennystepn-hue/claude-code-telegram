import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import type { Access, GateResult } from '../types.js';
import { ACCESS_FILE } from './config.js';

export type GateContext = {
  senderId: string;
  chatId: string;
  chatType: string;
  mentionedBot?: boolean;
};

/**
 * Load access configuration from ACCESS_FILE.
 * Returns a default (disabled) configuration if the file does not exist.
 */
export function loadAccess(): Access {
  try {
    const raw = readFileSync(ACCESS_FILE, 'utf-8');
    return JSON.parse(raw) as Access;
  } catch {
    return {
      dmPolicy: 'disabled',
      allowFrom: [],
      groups: {},
      pending: {},
    };
  }
}

/**
 * Persist access configuration to ACCESS_FILE.
 */
export function saveAccess(access: Access): void {
  mkdirSync(dirname(ACCESS_FILE), { recursive: true });
  writeFileSync(ACCESS_FILE, JSON.stringify(access, null, 2), 'utf-8');
}

/**
 * Throw an error if the given chatId is not in the allowlist.
 */
export function assertAllowedChat(chatId: string): void {
  const access = loadAccess();
  if (!access.allowFrom.includes(chatId)) {
    throw new Error(`Chat ${chatId} is not allowed`);
  }
}

/**
 * Generate a short random pairing token (6 hex chars).
 */
function generateToken(): string {
  return randomBytes(3).toString('hex');
}

/**
 * Evaluate whether an incoming message should be delivered, dropped, or paired.
 */
export function gate(access: Access, ctx: GateContext): GateResult {
  const { senderId, chatId, chatType, mentionedBot } = ctx;
  const isPrivate = chatType === 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // Global kill-switch
  if (access.dmPolicy === 'disabled' && isPrivate) {
    return { action: 'drop' };
  }

  if (isPrivate) {
    // Allowlisted sender → always deliver
    if (access.allowFrom.includes(senderId)) {
      return { action: 'deliver' };
    }

    // Strict allowlist with no pairing
    if (access.dmPolicy === 'allowlist') {
      return { action: 'drop' };
    }

    // Pairing mode: generate a token
    if (access.dmPolicy === 'pairing') {
      const token = generateToken();
      return { action: 'pair', token };
    }

    return { action: 'drop' };
  }

  if (isGroup) {
    const policy = access.groups[chatId];

    // No policy registered for this group → drop
    if (!policy) {
      return { action: 'drop' };
    }

    // Group requires bot mention but the bot was not mentioned → drop
    if (policy.requireMention && !mentionedBot) {
      return { action: 'drop' };
    }

    // Sender-level allow list for the group (empty list = allow all)
    if (policy.allowFrom.length > 0 && !policy.allowFrom.includes(senderId)) {
      return { action: 'drop' };
    }

    return { action: 'deliver' };
  }

  // Unknown chat type → drop
  return { action: 'drop' };
}
