import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import { AcceptAllFilter, KeywordFilter } from '../../src/server/infrastructure/videoFilters.js';

function makeVideo(title: string, description = ''): Video {
  return {
    videoId: 'abc123',
    title,
    description,
    url: 'https://www.youtube.com/watch?v=abc123',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

describe('AcceptAllFilter', () => {
  it('matches everything', () => {
    const filter = new AcceptAllFilter();

    expect(filter.matches(makeVideo('Anything at all'))).toBe(true);
    expect(filter.matches(makeVideo('', ''))).toBe(true);
  });
});

describe('KeywordFilter', () => {
  it('matches a keyword in the title case-insensitively', () => {
    const filter = new KeywordFilter(['bastrop']);

    expect(filter.matches(makeVideo('BASTROP County Update'))).toBe(true);
  });

  it('matches a keyword in the description', () => {
    const filter = new KeywordFilter(['bastrop']);

    const video = makeVideo('Regional News Roundup', 'Today in Bastrop county...');
    expect(filter.matches(video)).toBe(true);
  });

  it('does not match when no keyword is present', () => {
    const filter = new KeywordFilter(['bastrop']);

    const video = makeVideo('Austin traffic update', 'All about Austin');
    expect(filter.matches(video)).toBe(false);
  });

  it('matches any of multiple keywords', () => {
    const filter = new KeywordFilter(['bastrop', 'elgin']);

    expect(filter.matches(makeVideo('Elgin city council meeting'))).toBe(true);
  });
});
