import { buildDailyDigest } from './digestSchedule.js';
import { localDayBounds, nextLocalDay } from './localDay.js';
import {
  PublishError,
  type DigestFormatter,
  type DigestStore,
  type EventSource,
  type FormattedTextPost,
  type PostPinner,
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
  /** Events today, including ongoing ones; tomorrow's preview is not counted. */
  readonly eventCount: number;
  readonly wouldPost?: FormattedTextPost;
  /** Set only when a pinner is configured and a digest was posted. */
  readonly pinned?: boolean;
}

export interface PostDailyDigestUseCaseOptions {
  eventSource: EventSource;
  digestStore: DigestStore;
  formatter: DigestFormatter;
  publisher: Publisher;
  /** When set, each new digest replaces the previous one as a sticky post. */
  pinner?: PostPinner;
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
      pinner,
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

    const tomorrow = nextLocalDay(day, timeZone);
    const events = await eventSource.fetchEventsBetween(day.start, tomorrow.end);
    const digest = buildDailyDigest(day, tomorrow, events);
    const eventCount = digest.todayEvents.length + digest.ongoing.length;
    // The post is titled "Happening today"; tomorrow alone is not worth one.
    if (eventCount === 0) {
      if (!dryRun) await digestStore.markDigestPosted(day.localDate);
      return { ...base, status: 'no_events', eventCount: 0 };
    }

    const post = formatter.format(digest);
    if (dryRun) {
      return { ...base, status: 'dry_run', eventCount, wouldPost: post };
    }

    let postId: string;
    try {
      postId = await publisher.submitTextPost(subreddit, post);
    } catch (error) {
      if (error instanceof PublishError) {
        return { ...base, status: 'publish_failed', eventCount };
      }
      throw error;
    }

    // Marked before pinning: a pin failure must not cause the next run to post again.
    await digestStore.markDigestPosted(day.localDate);
    if (!pinner) return { ...base, status: 'posted', eventCount };
    return { ...base, status: 'posted', eventCount, pinned: await this.pin(pinner, postId) };
  }

  /** Replaces the previous digest's sticky with this one. Never throws. */
  private async pin(pinner: PostPinner, postId: string): Promise<boolean> {
    const { digestStore } = this.options;
    const previous = await digestStore.pinnedPostId();
    if (previous) {
      // A deleted or already-unpinned post fails here; the new pin should still go ahead.
      await pinner.unpin(previous).catch((error: unknown) => {
        console.warn(`could not unpin previous digest ${previous}:`, error);
      });
    }
    try {
      await pinner.pin(postId);
      await digestStore.setPinnedPostId(postId);
      return true;
    } catch (error) {
      console.warn(`could not pin digest ${postId}:`, error);
      await digestStore.setPinnedPostId(null);
      return false;
    }
  }
}
