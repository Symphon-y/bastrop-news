import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import {
  PassthroughFormatter,
  REDDIT_TITLE_MAX_LENGTH,
} from '../../src/server/infrastructure/passthroughFormatter.js';

function makeVideo(title: string): Video {
  return {
    videoId: 'abc123',
    title,
    description: 'Some description',
    url: 'https://www.youtube.com/watch?v=abc123',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

describe('PassthroughFormatter', () => {
  it('maps title and url through unchanged', () => {
    const formatter = new PassthroughFormatter();

    const post = formatter.format(makeVideo('New Bastrop Video'));

    expect(post.title).toBe('New Bastrop Video');
    expect(post.url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('truncates titles longer than the Reddit limit', () => {
    const formatter = new PassthroughFormatter();
    const longTitle = 'x'.repeat(REDDIT_TITLE_MAX_LENGTH + 50);

    const post = formatter.format(makeVideo(longTitle));

    expect(post.title.length).toBe(REDDIT_TITLE_MAX_LENGTH);
  });

  it('leaves titles at exactly the limit unchanged', () => {
    const formatter = new PassthroughFormatter();
    const title = 'x'.repeat(REDDIT_TITLE_MAX_LENGTH);

    const post = formatter.format(makeVideo(title));

    expect(post.title).toBe(title);
  });
});
