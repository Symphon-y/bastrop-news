import type { VideoFilter, VideoSource } from '../application/ports.js';
import type { Video } from '../domain/video.js';

export class FilteredVideoSource implements VideoSource {
  constructor(
    private readonly source: VideoSource,
    private readonly filter: VideoFilter,
  ) {}

  async fetchLatest(): Promise<Video[]> {
    const videos = await this.source.fetchLatest();
    return videos.filter((video) => this.filter.matches(video));
  }
}
