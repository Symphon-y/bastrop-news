import { describe, expect, it } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import { FilteredVideoSource } from '../../src/server/infrastructure/filteredVideoSource.js';
import { AcceptAllFilter, KeywordFilter } from '../../src/server/infrastructure/videoFilters.js';

function makeVideo(videoId: string, title: string): Video {
  return {
    videoId,
    title,
    description: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
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

  it('returns an empty list when nothing matches', async () => {
    const videos = [makeVideo('a', 'Austin news')];
    const source = new FilteredVideoSource(
      new FakeInnerSource(videos),
      new KeywordFilter(['bastrop']),
    );

    expect(await source.fetchLatest()).toEqual([]);
  });
});
