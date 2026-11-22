import type { CalendarEvent } from '../domain/calendarEvent.js';
import type { Video } from '../domain/video.js';
import type { LocalDay } from './localDay.js';

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
}

export interface FormattedTextPost {
  readonly title: string;
  readonly body: string;
}

export interface DigestFormatter {
  format(day: LocalDay, events: readonly CalendarEvent[]): FormattedTextPost;
}
