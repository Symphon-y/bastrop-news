import { buildDailyDigest } from './digestSchedule.js';
import { localDayBounds, nextLocalDay } from './localDay.js';
import {
  PublishError,
  type DigestFormatter,
  type DigestStore,
  type EventSource,
  type FormattedTextPost,
  type PostHighlighter,
  type Publisher,
} from './ports.js';

const HOUR_MS = 60 * 60 * 1000;
/**
 * A digest's highlight expires this long after the next digest is due. Normally the
 * next digest unhighlights it first; the expiry is the backstop if that run fails, so
 * a stale digest never stays featured for more than a couple of hours past its day.
 */
const HIGHLIGHT_GRACE_HOURS = 2;

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
  /** Set only when a highlighter is configured and a digest was posted. */
  readonly highlighted?: boolean;
}

export interface PostDailyDigestUseCaseOptions {
  eventSource: EventSource;
  digestStore: DigestStore;
  formatter: DigestFormatter;
  publisher: Publisher;
  /** When set, each new digest replaces the previous one in community highlights. */
  highlighter?: PostHighlighter;
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
      highlighter,
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

    // Marked before highlighting: a highlight failure must not cause the next run to post again.
    await digestStore.markDigestPosted(day.localDate);
    if (!highlighter) return { ...base, status: 'posted', eventCount };
    const until = new Date(tomorrow.start.getTime() + (digestHour + HIGHLIGHT_GRACE_HOURS) * HOUR_MS);
    return { ...base, status: 'posted', eventCount, highlighted: await this.highlight(highlighter, postId, until) };
  }

  /** Replaces the previous digest in community highlights with this one. Never throws. */
  private async highlight(highlighter: PostHighlighter, postId: string, until: Date): Promise<boolean> {
    const { digestStore } = this.options;
    const previous = await digestStore.highlightedPostId();
    if (previous) {
      // A deleted or expired highlight fails or no-ops here; the new one should still go ahead.
      await highlighter.unhighlight(previous).catch((error: unknown) => {
        console.warn(`could not unhighlight previous digest ${previous}:`, error);
      });
    }
    try {
      await highlighter.highlight(postId, until);
      await digestStore.setHighlightedPostId(postId);
      return true;
    } catch (error) {
      console.warn(`could not highlight digest ${postId}:`, error);
      await digestStore.setHighlightedPostId(null);
      return false;
    }
  }
}
