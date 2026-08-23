export interface Video {
  readonly videoId: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly publishedAt: Date;
  /**
   * Width divided by height; below 1 is a vertical video. Undefined means unknown --
   * either the aspect ratio was never fetched or the API did not report it.
   *
   * Consumed during ingest and deliberately not persisted: by the time a video is
   * queued the question has already been answered.
   */
  readonly aspectRatio?: number;
}
