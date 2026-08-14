import type { VideoSource } from '../../src/server/application/ports.js';
import type { Video } from '../../src/server/domain/video.js';

export class FakeVideoSource implements VideoSource {
  constructor(private readonly videos: Video[]) {}

  async fetchLatest(): Promise<Video[]> {
    return [...this.videos];
  }
}
