import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parsePlaylistItems,
  YoutubeDataApiSource,
} from '../../src/server/infrastructure/youtubeDataApiSource.js';

const PLAYLIST_ITEMS_FIXTURE = {
  items: [
    {
      snippet: {
        title: 'Bastrop City Council - August 11, 2026',
        description: "Stay informed about Bastrop's meetings...",
        publishedAt: '2026-08-13T00:52:44Z',
        resourceId: { videoId: 'LUQ6ddqp78M' },
      },
    },
    {
      snippet: {
        title: 'Bastrop City Council - July 28, 2026',
        description: 'Meeting recording',
        publishedAt: '2026-07-29T21:50:38Z',
        resourceId: { videoId: 'N0bkWR3iMF0' },
      },
    },
  ],
};

const CHANNELS_FIXTURE = {
  items: [
    {
      contentDetails: {
        relatedPlaylists: { uploads: 'UUeI3MYcqXy8CPUt5UhA7bpw' },
      },
    },
  ],
};

describe('parsePlaylistItems', () => {
  it('maps playlistItems entries to Video objects', () => {
    const videos = parsePlaylistItems(PLAYLIST_ITEMS_FIXTURE);

    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      videoId: 'LUQ6ddqp78M',
      title: 'Bastrop City Council - August 11, 2026',
      description: "Stay informed about Bastrop's meetings...",
      url: 'https://www.youtube.com/watch?v=LUQ6ddqp78M',
      publishedAt: new Date('2026-08-13T00:52:44Z'),
    });
  });

  it('returns an empty list for a response with no items', () => {
    expect(parsePlaylistItems({ items: [] })).toEqual([]);
  });
});

describe('YoutubeDataApiSource', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/channels')) {
          return new Response(JSON.stringify(CHANNELS_FIXTURE), { status: 200 });
        }
        if (url.includes('/playlistItems')) {
          return new Response(JSON.stringify(PLAYLIST_ITEMS_FIXTURE), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the uploads playlist then fetches its latest items', async () => {
    const source = new YoutubeDataApiSource('UCeI3MYcqXy8CPUt5UhA7bpw', 'fake-api-key');

    const videos = await source.fetchLatest();

    expect(videos).toHaveLength(2);
    expect(videos[0].videoId).toBe('LUQ6ddqp78M');

    const calledUrls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(calledUrls[0]).toContain('/channels');
    expect(calledUrls[0]).toContain('id=UCeI3MYcqXy8CPUt5UhA7bpw');
    expect(calledUrls[1]).toContain('/playlistItems');
    expect(calledUrls[1]).toContain('playlistId=UUeI3MYcqXy8CPUt5UhA7bpw');
    expect(calledUrls.every((url: string) => url.includes('key=fake-api-key'))).toBe(true);
  });

  it('throws if the channel has no resolvable uploads playlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    );
    const source = new YoutubeDataApiSource('UCunknown', 'fake-api-key');

    await expect(source.fetchLatest()).rejects.toThrow();
  });
});
