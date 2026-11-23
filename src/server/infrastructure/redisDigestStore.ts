import type { DigestStore } from '../application/ports.js';
import type { RedisClientLike } from './redisVideoQueueStore.js';

const LAST_DIGEST_DATE_KEY = 'events:last_digest_date';
const HIGHLIGHTED_POST_KEY = 'events:highlighted_digest_post_id';

/**
 * Keeps the date of the last digest and the id of the digest post the app added to
 * community highlights; event data itself is never stored.
 */
export class RedisDigestStore implements DigestStore {
  constructor(private readonly redis: Pick<RedisClientLike, 'get' | 'set'>) {}

  async lastDigestDate(): Promise<string | null> {
    return (await this.redis.get(LAST_DIGEST_DATE_KEY)) ?? null;
  }

  async markDigestPosted(localDate: string): Promise<void> {
    await this.redis.set(LAST_DIGEST_DATE_KEY, localDate);
  }

  async highlightedPostId(): Promise<string | null> {
    return (await this.redis.get(HIGHLIGHTED_POST_KEY)) || null;
  }

  /** Cleared by writing an empty string; the narrow client has no delete. */
  async setHighlightedPostId(postId: string | null): Promise<void> {
    await this.redis.set(HIGHLIGHTED_POST_KEY, postId ?? '');
  }
}
