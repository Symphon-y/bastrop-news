import type { DigestStore } from '../application/ports.js';
import type { RedisClientLike } from './redisVideoQueueStore.js';

const LAST_DIGEST_DATE_KEY = 'events:last_digest_date';

/** Only the date of the last digest is kept; event data itself is never stored. */
export class RedisDigestStore implements DigestStore {
  constructor(private readonly redis: Pick<RedisClientLike, 'get' | 'set'>) {}

  async lastDigestDate(): Promise<string | null> {
    return (await this.redis.get(LAST_DIGEST_DATE_KEY)) ?? null;
  }

  async markDigestPosted(localDate: string): Promise<void> {
    await this.redis.set(LAST_DIGEST_DATE_KEY, localDate);
  }
}
