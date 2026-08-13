import { redis } from '@devvit/redis';
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

/**
 * "Posted" state is represented purely by absence from the pending_queue sorted set,
 * not by a field on the stored video -- once markPosted removes a videoId from the
 * queue, video:{id} still exists (so enqueueIfNew keeps treating it as known) but
 * nextPending will never return it again.
 */
export class RedisVideoQueueStore implements VideoQueueStore {
  async enqueueIfNew(video: Video): Promise<boolean> {
    const key = videoKey(video.videoId);
    const existing = await redis.get(key);
    if (existing !== undefined) {
      return false;
    }
    const stored: StoredVideo = {
      title: video.title,
      description: video.description,
      url: video.url,
      publishedAt: video.publishedAt.toISOString(),
    };
    await redis.set(key, JSON.stringify(stored));
    await redis.zAdd(PENDING_QUEUE_KEY, { member: video.videoId, score: video.publishedAt.getTime() });
    return true;
  }

  async nextPending(): Promise<Video | null> {
    const oldest = await redis.zRange(PENDING_QUEUE_KEY, 0, 0);
    if (oldest.length === 0) {
      return null;
    }
    const videoId = oldest[0].member;
    const raw = await redis.get(videoKey(videoId));
    if (raw === undefined) {
      await redis.zRem(PENDING_QUEUE_KEY, [videoId]);
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
    await redis.zRem(PENDING_QUEUE_KEY, [videoId]);
    await redis.set(LAST_POSTED_AT_KEY, postedAt.toISOString());
  }

  async lastPostedAt(): Promise<Date | null> {
    const raw = await redis.get(LAST_POSTED_AT_KEY);
    return raw === undefined ? null : new Date(raw);
  }
}
