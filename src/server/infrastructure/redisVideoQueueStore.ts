import type { VideoQueueStore } from '../application/ports.js';
import type { Video } from '../domain/video.js';

const PENDING_QUEUE_KEY = 'ytreddit:pending_queue';
const LAST_POSTED_AT_KEY = 'ytreddit:last_posted_at';

/**
 * YouTube's Developer Policies cap retention of non-authorized API data at 30 days.
 * Expiring these records cannot resurrect a video: the age window refuses anything
 * older than maxVideoAgeHours, so a record that expires here is already weeks past
 * being eligible to queue.
 */
const VIDEO_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function videoKey(videoId: string): string {
  return `ytreddit:video:${videoId}`;
}

interface StoredVideo {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
}

/** The slice of @devvit/redis this adapter uses, narrow enough for tests to supply
 * an in-memory fake. */
export interface RedisClientLike {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  expire(key: string, seconds: number): Promise<void>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
  ): Promise<{ member: string; score: number }[]>;
  zRem(key: string, members: string[]): Promise<number>;
}

/**
 * "Posted" is represented by absence from the pending queue: markPosted removes the
 * id from the sorted set while video:{id} survives, so enqueueIfNew still recognises
 * the video as known and nextPending never returns it again.
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
    await this.redis.expire(key, VIDEO_RETENTION_SECONDS);
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
