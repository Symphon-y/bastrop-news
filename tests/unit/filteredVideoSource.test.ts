import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import { FilteredVideoSource } from '../../src/server/infrastructure/filteredVideoSource.js';
import {
  AcceptAllFilter,
  KeywordFilter,
  LandscapeOnlyFilter,
} from '../../src/server/infrastructure/videoFilters.js';

function makeVideo(videoId: string, title: string, aspectRatio?: number): Video {
  return {
    videoId,
    title,
    description: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
    aspectRatio,
  };
}

class FakeInnerSource {
  constructor(private readonly videos: Video[]) {}

  async fetchLatest(): Promise<Video[]> {
    return this.videos;
  }
}

describe('FilteredVideoSource', () => {
  it('passes through all videos with AcceptAllFilter', async () => {
    const videos = [makeVideo('a', 'Austin news'), makeVideo('b', 'Bastrop news')];
    const source = new FilteredVideoSource(new FakeInnerSource(videos), new AcceptAllFilter());

    const result = await source.fetchLatest();

    expect(result).toEqual(videos);
  });

  it('only returns videos matching a keyword filter', async () => {
    const videos = [makeVideo('a', 'Austin news'), makeVideo('b', 'Bastrop news')];
    const source = new FilteredVideoSource(
      new FakeInnerSource(videos),
      new KeywordFilter(['bastrop']),
    );

    const result = await source.fetchLatest();

    expect(result.map((v) => v.videoId)).toEqual(['b']);
  });

  // Filters compose by nesting the decorator, which is why no composite filter exists.
  it('applies both filters when two are nested', async () => {
    const videos = [
      makeVideo('a', 'Bastrop news', 1.778),
      makeVideo('b', 'Bastrop news, vertical cut', 0.5625),
      makeVideo('c', 'Austin news', 1.778),
    ];
    const source = new FilteredVideoSource(
      new FilteredVideoSource(new FakeInnerSource(videos), new KeywordFilter(['bastrop'])),
      new LandscapeOnlyFilter(),
    );

    const result = await source.fetchLatest();

    expect(result.map((v) => v.videoId)).toEqual(['a']);
  });

  it('returns an empty list when nothing matches', async () => {
    const videos = [makeVideo('a', 'Austin news')];
    const source = new FilteredVideoSource(
      new FakeInnerSource(videos),
      new KeywordFilter(['bastrop']),
    );

    expect(await source.fetchLatest()).toEqual([]);
  });
});
