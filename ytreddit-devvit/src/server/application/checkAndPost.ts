import {
  PublishError,
  type FormattedPost,
  type PostFormatter,
  type Publisher,
  type VideoQueueStore,
  type VideoSource,
} from './ports.js';

export type GateStatus = 'posted' | 'gate_closed' | 'queue_empty' | 'publish_failed' | 'dry_run';

export interface QueuedVideoSummary {
  readonly videoId: string;
  readonly title: string;
}

export interface RunResult {
  readonly fetched: number;
  readonly newlyQueued: number;
  readonly postedVideoId: string | null;
  readonly gateStatus: GateStatus;
  /** Every video this run accepted into the queue -- the diagnostic that shows what
   * the keyword filters actually let through, without waiting for it to be posted. */
  readonly queuedThisRun: readonly QueuedVideoSummary[];
  /** In dry-run mode only: the post that would have been submitted. */
  readonly wouldPost?: FormattedPost;
}

export interface CheckAndPostUseCaseOptions {
  videoSources: VideoSource[];
  queueStore: VideoQueueStore;
  formatter: PostFormatter;
  publisher: Publisher;
  subreddit: string;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
  nowFn: () => Date;
  /** When true, ingest normally but never publish, never mark posted, and never
   * advance the time gate -- so a run reports exactly what it would have done. */
  dryRun?: boolean;
}

export class CheckAndPostUseCase {
  constructor(private readonly options: CheckAndPostUseCaseOptions) {}

  async run(): Promise<RunResult> {
    const {
      videoSources,
      queueStore,
      formatter,
      publisher,
      subreddit,
      minSecondsBetweenPosts,
      maxVideoAgeHours,
      nowFn,
      dryRun = false,
    } = this.options;
    const now = nowFn();

    const videoLists = await Promise.all(videoSources.map((source) => source.fetchLatest()));
    const videos = videoLists.flat();

    const cutoff = new Date(now.getTime() - maxVideoAgeHours * 60 * 60 * 1000);
    const queuedThisRun: QueuedVideoSummary[] = [];
    for (const video of videos) {
      if (video.publishedAt >= cutoff && (await queueStore.enqueueIfNew(video))) {
        queuedThisRun.push({ videoId: video.videoId, title: video.title });
      }
    }
    const base = { fetched: videos.length, newlyQueued: queuedThisRun.length, queuedThisRun };

    const lastPosted = await queueStore.lastPostedAt();
    const gateOpen =
      lastPosted === null || now.getTime() - lastPosted.getTime() >= minSecondsBetweenPosts * 1000;
    if (!gateOpen) {
      return { ...base, postedVideoId: null, gateStatus: 'gate_closed' };
    }

    const nextVideo = await queueStore.nextPending();
    if (nextVideo === null) {
      return { ...base, postedVideoId: null, gateStatus: 'queue_empty' };
    }

    const post = formatter.format(nextVideo);
    if (dryRun) {
      return { ...base, postedVideoId: null, gateStatus: 'dry_run', wouldPost: post };
    }

    try {
      await publisher.submitLinkPost(subreddit, post);
    } catch (error) {
      if (error instanceof PublishError) {
        return { ...base, postedVideoId: null, gateStatus: 'publish_failed' };
      }
      throw error;
    }

    await queueStore.markPosted(nextVideo.videoId, now);
    return { ...base, postedVideoId: nextVideo.videoId, gateStatus: 'posted' };
  }
}
