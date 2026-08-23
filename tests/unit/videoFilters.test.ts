import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import {
  AcceptAllFilter,
  KeywordFilter,
  LandscapeOnlyFilter,
} from '../../src/server/infrastructure/videoFilters.js';

function makeVideo(title: string, description = '', aspectRatio?: number): Video {
  return {
    videoId: 'abc123',
    title,
    description,
    url: 'https://www.youtube.com/watch?v=abc123',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    aspectRatio,
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

describe('LandscapeOnlyFilter', () => {
  it('matches a 16:9 video', () => {
    expect(new LandscapeOnlyFilter().matches(makeVideo('Council meeting', '', 1.778))).toBe(true);
  });

  it('does not match a 9:16 video', () => {
    expect(new LandscapeOnlyFilter().matches(makeVideo('Same story, again', '', 0.5625))).toBe(
      false,
    );
  });

  it('matches a square video', () => {
    expect(new LandscapeOnlyFilter().matches(makeVideo('Square', '', 1))).toBe(true);
  });

  it('fails open when the orientation is unknown, so an API hiccup never swallows news', () => {
    expect(new LandscapeOnlyFilter().matches(makeVideo('Bastrop fire update'))).toBe(true);
  });
});
