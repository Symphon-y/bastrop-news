import type { FormattedPost, PostFormatter } from '../application/ports.js';
import type { Video } from '../domain/video.js';

export const REDDIT_TITLE_MAX_LENGTH = 300;

export class PassthroughFormatter implements PostFormatter {
  format(video: Video): FormattedPost {
    return {
      title: video.title.slice(0, REDDIT_TITLE_MAX_LENGTH),
      url: video.url,
    };
  }
}
