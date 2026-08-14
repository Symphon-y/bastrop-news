import type { VideoQueueStore } from '../application/ports.js';
import type { Video } from '../domain/video.js';

const PENDING_QUEUE_KEY = 'ytreddit:pending_queue';
const LAST_POSTED_AT_KEY = 'ytreddit:last_posted_at';

function videoKey(videoId: string): string {
  return `ytreddit:video:${videoId}`;
}

interface StoredVideo {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

/** The minimal slice of @devvit/redis's RedisClient this adapter needs -- lets tests
 * inject a plain in-memory fake instead of Devvit's low-level protobuf plugin mock,
 * same approach as RedditPublisher's RedditClientLike. */
export interface RedisClientLike {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
  ): Promise<{ member: string; score: number }[]>;
  zRem(key: string, members: string[]): Promise<number>;
}

/**
 * "Posted" state is represented purely by absence from the pending_queue sorted set,
 * not by a field on the stored video -- once markPosted removes a videoId from the
 * queue, video:{id} still exists (so enqueueIfNew keeps treating it as known) but
 * nextPending will never return it again.
 */
export class RedisVideoQueueStore implements VideoQueueStore {
  constructor(private readonly redis: RedisClientLike) {}

  async enqueueIfNew(video: Video): Promise<boolean> {
    const key = videoKey(video.videoId);
    const existing = await this.redis.get(key);
    if (existing !== undefined) {
      return false;
    }
    const stored: StoredVideo = {
      title: video.title,
      description: video.description,
      url: video.url,
      publishedAt: video.publishedAt.toISOString(),
    };
    await this.redis.set(key, JSON.stringify(stored));
    await this.redis.zAdd(PENDING_QUEUE_KEY, {
      member: video.videoId,
      score: video.publishedAt.getTime(),
    });
    return true;
  }

  async nextPending(): Promise<Video | null> {
    const oldest = await this.redis.zRange(PENDING_QUEUE_KEY, 0, 0);
    if (oldest.length === 0) {
      return null;
    }
    const videoId = oldest[0].member;
    const raw = await this.redis.get(videoKey(videoId));
    if (raw === undefined) {
      await this.redis.zRem(PENDING_QUEUE_KEY, [videoId]);
      return this.nextPending();
    }
    const stored = JSON.parse(raw) as StoredVideo;
    return {
      videoId,
      title: stored.title,
      description: stored.description,
      url: stored.url,
      publishedAt: new Date(stored.publishedAt),
    };
  }

  async markPosted(videoId: string, postedAt: Date): Promise<void> {
    await this.redis.zRem(PENDING_QUEUE_KEY, [videoId]);
    await this.redis.set(LAST_POSTED_AT_KEY, postedAt.toISOString());
  }

  async lastPostedAt(): Promise<Date | null> {
    const raw = await this.redis.get(LAST_POSTED_AT_KEY);
    return raw === undefined ? null : new Date(raw);
  }
}
