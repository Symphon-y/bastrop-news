import type { VideoFilter } from '../application/ports.js';
import type { Video } from '../domain/video.js';

export class AcceptAllFilter implements VideoFilter {
  matches(_video: Video): boolean {
    return true;
  }
}

export class KeywordFilter implements VideoFilter {
  private readonly keywords: string[];

  constructor(keywords: readonly string[]) {
    this.keywords = keywords.map((keyword) => keyword.toLowerCase());
  }

  matches(video: Video): boolean {
    const haystack = `${video.title} ${video.description}`.toLowerCase();
    return this.keywords.some((keyword) => haystack.includes(keyword));
  }
}
