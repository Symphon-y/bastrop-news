import type { DigestStore } from '../application/ports.js';
import type { RedisClientLike } from './redisVideoQueueStore.js';

const LAST_DIGEST_DATE_KEY = 'events:last_digest_date';
const PINNED_POST_KEY = 'events:pinned_digest_post_id';

/**
 * Keeps the date of the last digest and the id of the digest post the app pinned;
 * event data itself is never stored.
 */
export class RedisDigestStore implements DigestStore {
  constructor(private readonly redis: Pick<RedisClientLike, 'get' | 'set'>) {}

  async lastDigestDate(): Promise<string | null> {
    return (await this.redis.get(LAST_DIGEST_DATE_KEY)) ?? null;
  }

  async markDigestPosted(localDate: string): Promise<void> {
    await this.redis.set(LAST_DIGEST_DATE_KEY, localDate);
  }

  async pinnedPostId(): Promise<string | null> {
    return (await this.redis.get(PINNED_POST_KEY)) || null;
  }

  /** Cleared by writing an empty string; the narrow client has no delete. */
  async setPinnedPostId(postId: string | null): Promise<void> {
    await this.redis.set(PINNED_POST_KEY, postId ?? '');
  }
}
