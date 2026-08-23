import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Video } from '../../src/server/domain/video.js';
import {
  AspectRatioVideoSource,
  parseAspectRatios,
} from '../../src/server/infrastructure/aspectRatioVideoSource.js';
import { FakeVideoSource } from '../fakes/fakeVideoSource.js';

/** Real dimensions the Data API returns at maxHeight=8192 for a 16:9 and a 9:16 upload. */
const VIDEOS_PLAYER_FIXTURE = {
  items: [
    { id: 'wide', player: { embedWidth: 14564, embedHeight: 8192 } },
    { id: 'tall', player: { embedWidth: 4608, embedHeight: 8192 } },
  ],
};

function makeVideo(videoId: string): Video {
  return {
    videoId,
    title: `Video ${videoId}`,
    description: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: new Date('2026-08-01T00:00:00Z'),
  };
}

function calledUrls(): string[] {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
    (call: unknown[]) => call[0] as string,
  );
}

describe('parseAspectRatios', () => {
  it('maps video ids to their width/height ratio', () => {
    const ratios = parseAspectRatios(VIDEOS_PLAYER_FIXTURE);

    expect(ratios.get('wide')).toBeCloseTo(1.778, 3);
    expect(ratios.get('tall')).toBeCloseTo(0.5625, 4);
  });

  it('omits entries whose dimensions are missing or unusable rather than mapping them to NaN', () => {
    const ratios = parseAspectRatios({
      items: [
        { id: 'no-player' },
        { id: 'no-height', player: { embedWidth: 1280 } },
        { id: 'zero-height', player: { embedWidth: 1280, embedHeight: 0 } },
        { id: 'not-a-number', player: { embedWidth: 'wide', embedHeight: 'tall' } },
      ],
    });

    expect(ratios.size).toBe(0);
  });

  it('returns an empty map for a response with no items', () => {
    expect(parseAspectRatios({ items: [] }).size).toBe(0);
  });
});

describe('AspectRatioVideoSource', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(VIDEOS_PLAYER_FIXTURE), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the aspect ratio and leaves every other field untouched', async () => {
    const inner = new FakeVideoSource([makeVideo('wide'), makeVideo('tall')]);
    const source = new AspectRatioVideoSource(inner, 'fake-api-key');

    const videos = await source.fetchLatest();

    expect(videos[0]).toEqual({ ...makeVideo('wide'), aspectRatio: videos[0].aspectRatio });
    expect(videos[0].aspectRatio).toBeCloseTo(1.778, 3);
    expect(videos[1].aspectRatio).toBeCloseTo(0.5625, 4);
  });

  it('looks every id up in a single batched call', async () => {
    const inner = new FakeVideoSource([makeVideo('wide'), makeVideo('tall')]);

    await new AspectRatioVideoSource(inner, 'fake-api-key').fetchLatest();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = calledUrls();
    expect(url).toContain('/videos');
    expect(url).toContain('id=wide,tall');
    expect(url).toContain('part=player');
    expect(url).toContain('key=fake-api-key');
  });

  it('always sends maxHeight, without which the API omits the dimensions entirely', async () => {
    const inner = new FakeVideoSource([makeVideo('wide')]);

    await new AspectRatioVideoSource(inner, 'fake-api-key').fetchLatest();

    expect(calledUrls()[0]).toContain('maxHeight=');
  });

  it('makes no request at all when the inner source returns nothing', async () => {
    const source = new AspectRatioVideoSource(new FakeVideoSource([]), 'fake-api-key');

    expect(await source.fetchLatest()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves the aspect ratio unknown for videos the API did not return', async () => {
    const inner = new FakeVideoSource([makeVideo('wide'), makeVideo('unlisted')]);

    const videos = await new AspectRatioVideoSource(inner, 'fake-api-key').fetchLatest();

    expect(videos[1].aspectRatio).toBeUndefined();
  });

  it('fails open when the lookup returns an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const inner = new FakeVideoSource([makeVideo('wide'), makeVideo('tall')]);

    const videos = await new AspectRatioVideoSource(inner, 'fake-api-key').fetchLatest();

    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.aspectRatio === undefined)).toBe(true);
  });

  it('fails open when the lookup throws, so one channel cannot abort ingest for the rest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const inner = new FakeVideoSource([makeVideo('wide')]);

    const videos = await new AspectRatioVideoSource(inner, 'fake-api-key').fetchLatest();

    expect(videos).toEqual([makeVideo('wide')]);
  });
});
