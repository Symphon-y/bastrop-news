import type { Video } from '../domain/video.js';

export interface VideoSource {
  fetchLatest(): Promise<Video[]>;
}

export interface VideoFilter {
  matches(video: Video): boolean;
}

export interface VideoQueueStore {
  /** Inserts the video if its id isn't already known. Returns true if newly added. */
  enqueueIfNew(video: Video): Promise<boolean>;
  /** The oldest (by publishedAt) video that hasn't been posted yet, or null. */
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
  /** Submits a link post, returns the created submission's id. */
  submitLinkPost(subreddit: string, post: FormattedPost): Promise<string>;
}
