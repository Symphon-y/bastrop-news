import type { CalendarEvent } from '../domain/calendarEvent.js';
import type { Video } from '../domain/video.js';
import type { DailyDigest } from './digestSchedule.js';

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
  submitTextPost(subreddit: string, post: FormattedTextPost): Promise<string>;
}

export interface EventSource {
  fetchEventsBetween(start: Date, end: Date): Promise<CalendarEvent[]>;
}

export interface DigestStore {
  /** `YYYY-MM-DD` of the last local day a digest was handled for, or null. */
  lastDigestDate(): Promise<string | null>;
  markDigestPosted(localDate: string): Promise<void>;
  /** The digest post the app last added to community highlights, so the next replaces it. */
  highlightedPostId(): Promise<string | null>;
  setHighlightedPostId(postId: string | null): Promise<void>;
}

/**
 * Reddit's community highlights (formerly sticky posts). Kept apart from Publisher:
 * highlighting is optional and needs moderator permission.
 */
export interface PostHighlighter {
  /** Highlights the post until `until`, when Reddit removes it by itself. */
  highlight(postId: string, until: Date): Promise<void>;
  unhighlight(postId: string): Promise<void>;
}

export interface FormattedTextPost {
  readonly title: string;
  readonly body: string;
}

export interface DigestFormatter {
  format(digest: DailyDigest): FormattedTextPost;
}
