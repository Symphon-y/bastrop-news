import { localDayBounds } from './localDay.js';
import {
  PublishError,
  type DigestFormatter,
  type DigestStore,
  type EventSource,
  type FormattedTextPost,
  type Publisher,
} from './ports.js';

export type DigestStatus =
  | 'posted'
  | 'not_due'
  | 'already_posted'
  | 'no_events'
  | 'publish_failed'
  | 'dry_run';

export interface DigestRunResult {
  readonly localDate: string;
  readonly status: DigestStatus;
  readonly eventCount: number;
  readonly wouldPost?: FormattedTextPost;
}

export interface PostDailyDigestUseCaseOptions {
  eventSource: EventSource;
  digestStore: DigestStore;
  formatter: DigestFormatter;
  publisher: Publisher;
  subreddit: string;
  timeZone: string;
  /** Local hour (0-23) from which the day's digest is due. */
  digestHour: number;
  nowFn: () => Date;
  /** Formats the digest but neither publishes it nor marks the day handled. */
  dryRun?: boolean;
}

/**
 * Called hourly; posts at most one digest per local day. Deciding "due" here rather
 * than with a once-a-day cron keeps the post at the same local hour across DST, and
 * means a failed run is retried an hour later instead of a day later.
 */
export class PostDailyDigestUseCase {
  constructor(private readonly options: PostDailyDigestUseCaseOptions) {}

  async run(): Promise<DigestRunResult> {
    const {
      eventSource,
      digestStore,
      formatter,
      publisher,
      subreddit,
      timeZone,
      digestHour,
      nowFn,
      dryRun = false,
    } = this.options;
    const day = localDayBounds(nowFn(), timeZone);
    const base = { localDate: day.localDate };

    if (day.hour < digestHour) {
      return { ...base, status: 'not_due', eventCount: 0 };
    }
    if ((await digestStore.lastDigestDate()) === day.localDate) {
      return { ...base, status: 'already_posted', eventCount: 0 };
    }

    const events = await eventSource.fetchEventsBetween(day.start, day.end);
    if (events.length === 0) {
      if (!dryRun) await digestStore.markDigestPosted(day.localDate);
      return { ...base, status: 'no_events', eventCount: 0 };
    }

    const post = formatter.format(day, events);
    if (dryRun) {
      return { ...base, status: 'dry_run', eventCount: events.length, wouldPost: post };
    }

    try {
      await publisher.submitTextPost(subreddit, post);
    } catch (error) {
      if (error instanceof PublishError) {
        return { ...base, status: 'publish_failed', eventCount: events.length };
      }
      throw error;
    }

    await digestStore.markDigestPosted(day.localDate);
    return { ...base, status: 'posted', eventCount: events.length };
  }
}
