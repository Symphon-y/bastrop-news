export interface ChannelWatch {
  readonly channelId: string;
  /** Empty means accept every video from this channel; non-empty means only videos
   * whose title/description contain at least one keyword (case-insensitive) are queued. */
  readonly keywords: readonly string[];
}

export const CHANNEL_WATCHES: readonly ChannelWatch[] = [
  { channelId: 'UCeI3MYcqXy8CPUt5UhA7bpw', keywords: [] }, // Bastrop TX Network -- all videos
  { channelId: 'UCxXTyFekH99JnS3qaXIQW7A', keywords: ['bastrop'] }, // KVUE
  { channelId: 'UCgBVz3EzHYKpPS0BITvLRsg', keywords: ['bastrop'] }, // KXAN
];
