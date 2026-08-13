import type { VideoQueueStore } from '../../src/server/application/ports.js';
import type { Video } from '../../src/server/domain/video.js';

interface Entry {
  video: Video;
  postedAt: Date | null;
}

export class FakeVideoQueueStore implements VideoQueueStore {
  private readonly entries = new Map<string, Entry>();

  async enqueueIfNew(video: Video): Promise<boolean> {
    if (this.entries.has(video.videoId)) {
      return false;
    }
    this.entries.set(video.videoId, { video, postedAt: null });
    return true;
  }

  async nextPending(): Promise<Video | null> {
    const pending = [...this.entries.values()]
      .filter((entry) => entry.postedAt === null)
      .sort((a, b) => a.video.publishedAt.getTime() - b.video.publishedAt.getTime());
    return pending.length > 0 ? pending[0].video : null;
  }

  async markPosted(videoId: string, postedAt: Date): Promise<void> {
    const entry = this.entries.get(videoId);
    if (entry) {
      entry.postedAt = postedAt;
    }
  }

  async lastPostedAt(): Promise<Date | null> {
    const postedDates = [...this.entries.values()]
      .map((entry) => entry.postedAt)
      .filter((date): date is Date => date !== null);
    if (postedDates.length === 0) return null;
    return new Date(Math.max(...postedDates.map((d) => d.getTime())));
  }
}
