import { PublishError, type PostFormatter, type Publisher, type VideoQueueStore, type VideoSource } from './ports.js';

export type GateStatus = 'posted' | 'gate_closed' | 'queue_empty' | 'publish_failed';

export interface RunResult {
  readonly fetched: number;
  readonly newlyQueued: number;
  readonly postedVideoId: string | null;
  readonly gateStatus: GateStatus;
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
}

export class CheckAndPostUseCase {
  constructor(private readonly options: CheckAndPostUseCaseOptions) {}

  async run(): Promise<RunResult> {
    const { videoSources, queueStore, formatter, publisher, subreddit, minSecondsBetweenPosts, maxVideoAgeHours, nowFn } =
      this.options;
    const now = nowFn();

    const videoLists = await Promise.all(videoSources.map((source) => source.fetchLatest()));
    const videos = videoLists.flat();

    const cutoff = new Date(now.getTime() - maxVideoAgeHours * 60 * 60 * 1000);
    let newlyQueued = 0;
    for (const video of videos) {
      if (video.publishedAt >= cutoff && (await queueStore.enqueueIfNew(video))) {
        newlyQueued += 1;
      }
    }

    const lastPosted = await queueStore.lastPostedAt();
    const gateOpen =
      lastPosted === null || now.getTime() - lastPosted.getTime() >= minSecondsBetweenPosts * 1000;
    if (!gateOpen) {
      return { fetched: videos.length, newlyQueued, postedVideoId: null, gateStatus: 'gate_closed' };
    }

    const nextVideo = await queueStore.nextPending();
    if (nextVideo === null) {
      return { fetched: videos.length, newlyQueued, postedVideoId: null, gateStatus: 'queue_empty' };
    }

    try {
      const post = formatter.format(nextVideo);
      await publisher.submitLinkPost(subreddit, post);
    } catch (error) {
      if (error instanceof PublishError) {
        return { fetched: videos.length, newlyQueued, postedVideoId: null, gateStatus: 'publish_failed' };
      }
      throw error;
    }

    await queueStore.markPosted(nextVideo.videoId, now);
    return { fetched: videos.length, newlyQueued, postedVideoId: nextVideo.videoId, gateStatus: 'posted' };
  }
}
