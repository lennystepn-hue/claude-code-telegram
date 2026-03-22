import { randomBytes } from 'crypto';
import type { StreamState } from '../types.js';
import { EditThrottle } from './throttle.js';
import { STREAM_EDIT_INTERVAL_MS } from '../access/config.js';

type ManagedStream = StreamState & { throttle: EditThrottle };

export class StreamManager {
  private streams: Map<string, ManagedStream> = new Map();

  /**
   * Create a new stream for the given chat and message, returning a unique stream ID.
   */
  create(chatId: string, messageId: number): string {
    const streamId = randomBytes(8).toString('hex');
    const stream: ManagedStream = {
      chatId,
      messageId,
      buffer: '',
      lastEdit: 0,
      timer: null,
      status: null,
      throttle: new EditThrottle(STREAM_EDIT_INTERVAL_MS),
    };
    this.streams.set(streamId, stream);
    return streamId;
  }

  /**
   * Retrieve the stream state, or null if the stream does not exist.
   */
  get(streamId: string): ManagedStream | null {
    return this.streams.get(streamId) ?? null;
  }

  /**
   * Append / replace the buffered content for a stream.
   */
  updateContent(streamId: string, content: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.buffer = content;
  }

  /**
   * Update the status label for a stream.
   */
  updateStatus(streamId: string, status: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.status = status;
  }

  /**
   * Mark the stream as finished: clear any pending timer and remove from the map.
   */
  finish(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    if (stream.timer !== null) {
      clearTimeout(stream.timer);
      stream.timer = null;
    }
    this.streams.delete(streamId);
  }
}
