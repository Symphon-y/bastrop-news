import { describe, expect, it } from 'vitest';
import { RedisDigestStore } from '../../src/server/infrastructure/redisDigestStore.js';
import { FakeRedis } from '../fakes/fakeRedis.js';

describe('RedisDigestStore', () => {
  it('returns null before any digest, then the last marked date', async () => {
    const store = new RedisDigestStore(new FakeRedis());

    expect(await store.lastDigestDate()).toBeNull();
    await store.markDigestPosted('2026-11-22');
    expect(await store.lastDigestDate()).toBe('2026-11-22');
  });

  it('remembers the pinned digest post, and forgets it when cleared', async () => {
    const store = new RedisDigestStore(new FakeRedis());

    expect(await store.pinnedPostId()).toBeNull();
    await store.setPinnedPostId('t3_digest');
    expect(await store.pinnedPostId()).toBe('t3_digest');
    await store.setPinnedPostId(null);
    expect(await store.pinnedPostId()).toBeNull();
  });
});
