import type { Video } from '../domain/video.js';

export interface VideoSource {
  fetchLatest(): Promise<Video[]>;
}

export interface VideoFilter {
  matches(video: Video): boolean;
}

export interface VideoQueueStore {
  enqueueIfNew(video: Video): Promise<boolean>;
  /** Oldest by publishedAt, not by insertion order. */
  nextPending(): Promise<Video | null>;
  markPosted(videoId: string, postedAt: Date): Promise<void>;
  lastPostedAt(): Promise<Date | null>;
}

export interface FormattedPost {
  readonly title: string;
  readonly url: string;
}

export interface PostFormatter {
  format(video: Video): FormattedPost;
}

export class PublishError extends Error {}

export interface Publisher {
  submitLinkPost(subreddit: string, post: FormattedPost): Promise<string>;
}
