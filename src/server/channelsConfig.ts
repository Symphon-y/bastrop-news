export interface ChannelWatch {
  readonly channelId: string;
  /** Empty means accept every video from this channel; non-empty means only videos
   * whose title/description contain at least one keyword (case-insensitive) are queued. */
  readonly keywords: readonly string[];
  /** Drop vertically-oriented uploads from this channel. The TV stations reformat one
   * story into a horizontal video and a vertical Short and publish both within the hour;
   * the city channel does not, so a vertical upload from it is the story itself. */
  readonly excludeVertical?: boolean;
}

export const CHANNEL_WATCHES: readonly ChannelWatch[] = [
  { channelId: 'UCeI3MYcqXy8CPUt5UhA7bpw', keywords: [] }, // Bastrop TX Network -- all videos
  { channelId: 'UCxXTyFekH99JnS3qaXIQW7A', keywords: ['bastrop'], excludeVertical: true }, // KVUE
  { channelId: 'UCgBVz3EzHYKpPS0BITvLRsg', keywords: ['bastrop'], excludeVertical: true }, // KXAN
];
