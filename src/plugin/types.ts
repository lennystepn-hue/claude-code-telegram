export type StreamState = {
  messageId: number;
  chatId: string;
  buffer: string;
  lastEdit: number;
  timer: ReturnType<typeof setTimeout> | null;
  status: string | null;
};

export type ButtonCallback = {
  resolve: (selected: string) => void;
  buttons: Array<{ text: string; id: string }>;
  messageId: number;
  chatId: string;
  expiresAt: number;
};

export type TaskItem = {
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
};

export type TaskDisplay = {
  messageId: number;
  chatId: string;
  streamId: string;
  tasks: TaskItem[];
  title: string;
};

export type GroupPolicy = {
  requireMention: boolean;
  allowFrom: string[];
};

export type PendingEntry = {
  senderId: string;
  chatId: string;
  createdAt: number;
  expiresAt: number;
  replies: number;
};

export type Access = {
  dmPolicy: 'pairing' | 'allowlist' | 'disabled';
  allowFrom: string[];
  groups: Record<string, GroupPolicy>;
  pending: Record<string, PendingEntry>;
  mentionPatterns?: string[];
  ackReaction?: string;
  replyToMode?: 'off' | 'first' | 'all';
  textChunkLimit?: number;
  chunkMode?: 'length' | 'newline';
};

export type GateResult =
  | { action: 'deliver' }
  | { action: 'drop' }
  | { action: 'pair'; token: string };
