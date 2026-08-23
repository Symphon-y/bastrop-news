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

/**
 * Drops vertically-oriented videos. The local TV stations reformat one story into a
 * horizontal video and a vertical Short, publish both within the hour, and both match
 * the keywords -- so the subreddit gets the story twice. The reformats are also titled
 * differently enough that comparing titles does not reliably pair them, which is why
 * this filters on shape instead.
 *
 * Fails open: a video whose aspect ratio could not be determined is accepted, so an API
 * hiccup can never silently swallow real news. Square counts as acceptable.
 */
export class LandscapeOnlyFilter implements VideoFilter {
  matches(video: Video): boolean {
    return video.aspectRatio === undefined || video.aspectRatio >= 1;
  }
}
