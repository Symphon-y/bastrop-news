import type { VideoSource } from '../application/ports.js';
import type { Video } from '../domain/video.js';

const YOUTUBE_API_BASE = 'https://youtube.googleapis.com/youtube/v3';
const MAX_RESULTS = 15;

interface PlaylistItemsResponse {
  items: {
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      resourceId: { videoId: string };
    };
  }[];
}

interface ChannelsResponse {
  items: {
    contentDetails: {
      relatedPlaylists: { uploads: string };
    };
  }[];
}

export function parsePlaylistItems(response: PlaylistItemsResponse): Video[] {
  return response.items.map((item) => ({
    videoId: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
    publishedAt: new Date(item.snippet.publishedAt),
  }));
}

export class YoutubeDataApiSource implements VideoSource {
  constructor(
    private readonly channelId: string,
    private readonly apiKey: string,
  ) {}

  async fetchLatest(): Promise<Video[]> {
    const uploadsPlaylistId = await this.resolveUploadsPlaylistId();
    const url =
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}` +
      `&maxResults=${MAX_RESULTS}&key=${this.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube playlistItems request failed: ${response.status}`);
    }
    const data = (await response.json()) as PlaylistItemsResponse;
    return parsePlaylistItems(data);
  }

  private async resolveUploadsPlaylistId(): Promise<string> {
    const url = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${this.channelId}&key=${this.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube channels request failed: ${response.status}`);
    }
    const data = (await response.json()) as ChannelsResponse;
    const uploadsPlaylistId = data.items[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error(`Could not resolve uploads playlist for channel ${this.channelId}`);
    }
    return uploadsPlaylistId;
  }
}
