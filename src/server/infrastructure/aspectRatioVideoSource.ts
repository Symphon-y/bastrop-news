import type { VideoSource } from '../application/ports.js';
import type { Video } from '../domain/video.js';

const YOUTUBE_API_BASE = 'https://youtube.googleapis.com/youtube/v3';
/** videos.list accepts at most 50 ids, and costs one quota unit however many are sent. */
const MAX_IDS_PER_CALL = 50;
/**
 * videos.list omits embedWidth/embedHeight entirely unless maxHeight or maxWidth is
 * supplied -- without this parameter every video comes back with no aspect ratio and the
 * filter silently degrades into a no-op. The largest allowed player gives the most
 * precise ratio.
 */
const PLAYER_MAX_HEIGHT = 8192;

interface VideosPlayerResponse {
  items: {
    id: string;
    player?: {
      embedWidth?: number | string;
      embedHeight?: number | string;
    };
  }[];
}

/**
 * Video ids to their width/height ratio. Entries whose dimensions are missing or
 * unusable are omitted rather than mapped to NaN, so an unparseable row reads as
 * "unknown" downstream instead of failing every comparison against it.
 */
export function parseAspectRatios(response: VideosPlayerResponse): Map<string, number> {
  const ratios = new Map<string, number>();
  for (const item of response.items ?? []) {
    const width = Number(item.player?.embedWidth);
    const height = Number(item.player?.embedHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue;
    if (width <= 0 || height <= 0) continue;
    ratios.set(item.id, width / height);
  }
  return ratios;
}

/**
 * Annotates videos with the aspect ratio the Data API reports for their embedded
 * player. The uploads endpoint the app reads carries no dimension data at all, so this
 * is the only way to tell a vertical reformat from the horizontal original.
 *
 * Wrap this around an already-filtered source: it costs a quota unit per call, and
 * enriching videos that are about to be discarded anyway wastes it.
 */
export class AspectRatioVideoSource implements VideoSource {
  constructor(
    private readonly source: VideoSource,
    private readonly apiKey: string,
  ) {}

  async fetchLatest(): Promise<Video[]> {
    const videos = await this.source.fetchLatest();
    if (videos.length === 0) return videos;

    const ids = videos.slice(0, MAX_IDS_PER_CALL).map((video) => video.videoId);
    const ratios = await this.fetchAspectRatios(ids);
    const enriched = videos.map((video) =>
      ratios.has(video.videoId) ? { ...video, aspectRatio: ratios.get(video.videoId)! } : video,
    );

    const known = enriched.filter((video) => video.aspectRatio !== undefined);
    const vertical = known.filter((video) => video.aspectRatio! < 1).length;
    // Ingest runs even under dryRun, so this line is how the filter's real behaviour
    // becomes visible before any video reaches the subreddit. A run that reports zero
    // known ratios means the lookup is failing and nothing is being filtered.
    console.log(
      `aspect-ratio: ${ids.length} checked, ${known.length} known, ${vertical} vertical`,
    );

    return enriched;
  }

  /**
   * Fails open on every error path, returning no ratios rather than throwing.
   * CheckAndPostUseCase fetches every source with Promise.all, so a throw here would
   * abort ingest for every other channel too -- a far worse outcome than letting one
   * duplicate through.
   */
  private async fetchAspectRatios(ids: string[]): Promise<Map<string, number>> {
    const url =
      `${YOUTUBE_API_BASE}/videos?part=player&maxHeight=${PLAYER_MAX_HEIGHT}` +
      `&id=${ids.join(',')}&key=${this.apiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`aspect-ratio lookup failed: HTTP ${response.status} -- treating as unknown`);
        return new Map();
      }
      return parseAspectRatios((await response.json()) as VideosPlayerResponse);
    } catch (error) {
      console.warn(
        `aspect-ratio lookup threw: ${error instanceof Error ? error.message : String(error)}` +
          ' -- treating as unknown',
      );
      return new Map();
    }
  }
}
