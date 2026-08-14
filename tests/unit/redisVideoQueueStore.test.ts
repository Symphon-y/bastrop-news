import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import { RedisVideoQueueStore } from '../../src/server/infrastructure/redisVideoQueueStore.js';
import { FakeRedis } from '../fakes/fakeRedis.js';

function makeVideo(videoId: string, publishedAt: string): Video {
  return {
    videoId,
    title: `Title ${videoId}`,
    description: `Description ${videoId}`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: new Date(publishedAt),
  };
}

function makeStore(): { store: RedisVideoQueueStore; redis: FakeRedis } {
  const redis = new FakeRedis();
  return { store: new RedisVideoQueueStore(redis), redis };
}

describe('RedisVideoQueueStore', () => {
  it('enqueues a new video and returns it as pending, round-tripping every field', async () => {
    const { store } = makeStore();
    const video = makeVideo('abc123', '2026-08-13T10:00:00.000Z');

    expect(await store.enqueueIfNew(video)).toBe(true);

    const pending = await store.nextPending();
    expect(pending).toEqual(video);
  });

  it('expires stored videos after 30 days, the YouTube retention cap', async () => {
    const { store, redis } = makeStore();
    const video = makeVideo('abc123', '2026-08-13T10:00:00.000Z');

    await store.enqueueIfNew(video);

    expect(redis.ttlOf('ytreddit:video:abc123')).toBe(30 * 24 * 60 * 60);
  });

  it('is idempotent -- re-enqueueing a known video returns false', async () => {
    const { store } = makeStore();
    const video = makeVideo('abc123', '2026-08-13T10:00:00.000Z');

    expect(await store.enqueueIfNew(video)).toBe(true);
    expect(await store.enqueueIfNew(video)).toBe(false);
  });

  it('still treats a posted video as known, so it is never requeued', async () => {
    const { store } = makeStore();
    const video = makeVideo('abc123', '2026-08-13T10:00:00.000Z');

    await store.enqueueIfNew(video);
    await store.markPosted(video.videoId, new Date('2026-08-13T12:00:00.000Z'));

    expect(await store.enqueueIfNew(video)).toBe(false);
    expect(await store.nextPending()).toBeNull();
  });

  it('returns pending videos oldest-first regardless of insertion order', async () => {
    const { store } = makeStore();
    const newer = makeVideo('newer', '2026-08-13T11:00:00.000Z');
    const older = makeVideo('older', '2026-08-13T09:00:00.000Z');

    await store.enqueueIfNew(newer);
    await store.enqueueIfNew(older);

    expect((await store.nextPending())?.videoId).toBe('older');
    await store.markPosted('older', new Date('2026-08-13T12:00:00.000Z'));
    expect((await store.nextPending())?.videoId).toBe('newer');
  });

  it('returns null when nothing is pending', async () => {
    const { store } = makeStore();
    expect(await store.nextPending()).toBeNull();
  });

  it('reports no last-posted time before anything has been posted', async () => {
    const { store } = makeStore();
    expect(await store.lastPostedAt()).toBeNull();
  });

  it('round-trips lastPostedAt through ISO-8601 without drift', async () => {
    const { store } = makeStore();
    const postedAt = new Date('2026-08-13T12:34:56.000Z');

    await store.enqueueIfNew(makeVideo('abc123', '2026-08-13T10:00:00.000Z'));
    await store.markPosted('abc123', postedAt);

    expect((await store.lastPostedAt())?.toISOString()).toBe(postedAt.toISOString());
  });

  it('skips and cleans up a queue entry whose stored video has gone missing', async () => {
    const { store, redis } = makeStore();
    await store.enqueueIfNew(makeVideo('orphan', '2026-08-13T09:00:00.000Z'));
    await store.enqueueIfNew(makeVideo('intact', '2026-08-13T10:00:00.000Z'));

    redis.deleteString('ytreddit:video:orphan');

    expect((await store.nextPending())?.videoId).toBe('intact');
    // the orphaned queue entry is gone, not re-scanned on every subsequent call
    expect(await redis.zRange('ytreddit:pending_queue', 0, -1)).toEqual([
      { member: 'intact', score: new Date('2026-08-13T10:00:00.000Z').getTime() },
    ]);
  });
});
