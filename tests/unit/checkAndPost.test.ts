import { describe, expect, it } from 'vitest';
import { CheckAndPostUseCase } from '../../src/server/application/checkAndPost.js';
import type { Publisher, VideoSource } from '../../src/server/application/ports.js';
import type { Video } from '../../src/server/domain/video.js';
import { PassthroughFormatter } from '../../src/server/infrastructure/passthroughFormatter.js';
import { FakePublisher } from '../fakes/fakePublisher.js';
import { FakeVideoQueueStore } from '../fakes/fakeVideoQueueStore.js';
import { FakeVideoSource } from '../fakes/fakeVideoSource.js';

const NOW = new Date('2026-08-13T12:00:00Z');
const MIN_SECONDS_BETWEEN_POSTS = 3600;
const MAX_VIDEO_AGE_HOURS = 48;

function makeVideo(videoId: string, publishedAt: Date): Video {
  return {
    videoId,
    title: `Title ${videoId}`,
    description: `Description ${videoId}`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt,
  };
}

function hoursBefore(hours: number, from: Date = NOW): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

function makeUseCase(options: {
  videoSources: VideoSource[];
  publisher: Publisher;
  queueStore?: FakeVideoQueueStore;
  now?: Date;
  minSecondsBetweenPosts?: number;
  maxVideoAgeHours?: number;
  dryRun?: boolean;
}): CheckAndPostUseCase {
  return new CheckAndPostUseCase({
    videoSources: options.videoSources,
    queueStore: options.queueStore ?? new FakeVideoQueueStore(),
    formatter: new PassthroughFormatter(),
    publisher: options.publisher,
    subreddit: 'BastropTX',
    minSecondsBetweenPosts: options.minSecondsBetweenPosts ?? MIN_SECONDS_BETWEEN_POSTS,
    maxVideoAgeHours: options.maxVideoAgeHours ?? MAX_VIDEO_AGE_HOURS,
    nowFn: () => options.now ?? NOW,
    dryRun: options.dryRun,
  });
}

describe('CheckAndPostUseCase', () => {
  it('queues and posts a new recent video when the gate is open', async () => {
    const video = makeVideo('abc123', hoursBefore(1));
    const publisher = new FakePublisher();
    const useCase = makeUseCase({ videoSources: [new FakeVideoSource([video])], publisher });

    const result = await useCase.run();

    expect(result.fetched).toBe(1);
    expect(result.newlyQueued).toBe(1);
    expect(result.postedVideoId).toBe('abc123');
    expect(result.gateStatus).toBe('posted');
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0].subreddit).toBe('BastropTX');
    expect(publisher.calls[0].post.url).toBe(video.url);
  });

  it('never queues a video older than the age window', async () => {
    const staleVideo = makeVideo('old1', hoursBefore(200));
    const publisher = new FakePublisher();
    const useCase = makeUseCase({ videoSources: [new FakeVideoSource([staleVideo])], publisher });

    const result = await useCase.run();

    expect(result.newlyQueued).toBe(0);
    expect(result.postedVideoId).toBeNull();
    expect(result.gateStatus).toBe('queue_empty');
    expect(publisher.calls).toHaveLength(0);
  });

  it('does not requeue an already-known video on a later run', async () => {
    const video = makeVideo('abc123', hoursBefore(1));
    const queueStore = new FakeVideoQueueStore();
    const source = new FakeVideoSource([video]);

    await makeUseCase({ videoSources: [source], publisher: new FakePublisher(), queueStore }).run();
    const result = await makeUseCase({
      videoSources: [source],
      publisher: new FakePublisher(),
      queueStore,
      now: new Date(NOW.getTime() + 1000),
    }).run();

    expect(result.newlyQueued).toBe(0);
  });

  it('posts nothing when the gate is closed', async () => {
    const older = makeVideo('first', hoursBefore(2));
    const newer = makeVideo('second', hoursBefore(1));
    const queueStore = new FakeVideoQueueStore();
    const publisher = new FakePublisher();

    const firstResult = await makeUseCase({
      videoSources: [new FakeVideoSource([older, newer])],
      publisher,
      queueStore,
    }).run();
    expect(firstResult.postedVideoId).toBe('first');

    const soonAfter = new Date(NOW.getTime() + 5 * 60 * 1000);
    const secondResult = await makeUseCase({
      videoSources: [new FakeVideoSource([])],
      publisher,
      queueStore,
      now: soonAfter,
    }).run();

    expect(secondResult.postedVideoId).toBeNull();
    expect(secondResult.gateStatus).toBe('gate_closed');
    expect(publisher.calls).toHaveLength(1);
  });

  it('drains the queue oldest-first across multiple gated runs', async () => {
    const older = makeVideo('first', hoursBefore(2));
    const newer = makeVideo('second', hoursBefore(1));
    const queueStore = new FakeVideoQueueStore();
    const publisher = new FakePublisher();

    const firstResult = await makeUseCase({
      videoSources: [new FakeVideoSource([older, newer])],
      publisher,
      queueStore,
    }).run();
    expect(firstResult.postedVideoId).toBe('first');

    const muchLater = new Date(NOW.getTime() + (MIN_SECONDS_BETWEEN_POSTS + 1) * 1000);
    const secondResult = await makeUseCase({
      videoSources: [new FakeVideoSource([])],
      publisher,
      queueStore,
      now: muchLater,
    }).run();

    expect(secondResult.postedVideoId).toBe('second');
    expect(publisher.calls).toHaveLength(2);
  });

  it('reports queue_empty status for an empty feed', async () => {
    const publisher = new FakePublisher();
    const useCase = makeUseCase({ videoSources: [new FakeVideoSource([])], publisher });

    const result = await useCase.run();

    expect(result.fetched).toBe(0);
    expect(result.newlyQueued).toBe(0);
    expect(result.postedVideoId).toBeNull();
    expect(result.gateStatus).toBe('queue_empty');
  });

  it('aggregates videos from multiple channel sources, posting the oldest first', async () => {
    const mainChannelVideo = makeVideo('main1', hoursBefore(3));
    const regionalChannelVideo = makeVideo('regional1', hoursBefore(1));
    const publisher = new FakePublisher();
    const useCase = makeUseCase({
      videoSources: [
        new FakeVideoSource([mainChannelVideo]),
        new FakeVideoSource([regionalChannelVideo]),
      ],
      publisher,
    });

    const result = await useCase.run();

    expect(result.fetched).toBe(2);
    expect(result.newlyQueued).toBe(2);
    expect(result.postedVideoId).toBe('main1');
  });

  it('leaves a video unposted and does not advance the gate on publish failure', async () => {
    const video = makeVideo('abc123', hoursBefore(1));
    const queueStore = new FakeVideoQueueStore();
    const failingPublisher = new FakePublisher(true);

    const useCase = makeUseCase({
      videoSources: [new FakeVideoSource([video])],
      publisher: failingPublisher,
      queueStore,
    });
    const result = await useCase.run();

    expect(result.postedVideoId).toBeNull();
    expect(result.gateStatus).toBe('publish_failed');
    expect(await queueStore.lastPostedAt()).toBeNull();
    const pending = await queueStore.nextPending();
    expect(pending?.videoId).toBe('abc123');
  });

  it('reports every video accepted this run, so filter behaviour is visible in logs', async () => {
    const publisher = new FakePublisher();
    const useCase = makeUseCase({
      videoSources: [
        new FakeVideoSource([makeVideo('main1', hoursBefore(3))]),
        new FakeVideoSource([makeVideo('regional1', hoursBefore(1)), makeVideo('old1', hoursBefore(200))]),
      ],
      publisher,
    });

    const result = await useCase.run();

    expect(result.queuedThisRun).toEqual([
      { videoId: 'main1', title: 'Title main1' },
      { videoId: 'regional1', title: 'Title regional1' },
    ]);
  });

  describe('dry run', () => {
    it('queues and reports what it would post without publishing', async () => {
      const video = makeVideo('abc123', hoursBefore(1));
      const publisher = new FakePublisher();
      const queueStore = new FakeVideoQueueStore();
      const useCase = makeUseCase({
        videoSources: [new FakeVideoSource([video])],
        publisher,
        queueStore,
        dryRun: true,
      });

      const result = await useCase.run();

      expect(result.newlyQueued).toBe(1);
      expect(result.gateStatus).toBe('dry_run');
      expect(result.postedVideoId).toBeNull();
      expect(result.wouldPost).toEqual({ title: video.title, url: video.url });
      expect(publisher.calls).toHaveLength(0);
    });

    it('leaves the video pending and the time-gate untouched', async () => {
      const video = makeVideo('abc123', hoursBefore(1));
      const queueStore = new FakeVideoQueueStore();

      await makeUseCase({
        videoSources: [new FakeVideoSource([video])],
        publisher: new FakePublisher(),
        queueStore,
        dryRun: true,
      }).run();

      expect(await queueStore.lastPostedAt()).toBeNull();
      expect((await queueStore.nextPending())?.videoId).toBe('abc123');
    });

    it('posts the video already queued by a dry run once dry run is turned off', async () => {
      const video = makeVideo('abc123', hoursBefore(1));
      const queueStore = new FakeVideoQueueStore();
      const publisher = new FakePublisher();

      await makeUseCase({
        videoSources: [new FakeVideoSource([video])],
        publisher,
        queueStore,
        dryRun: true,
      }).run();

      const result = await makeUseCase({
        videoSources: [new FakeVideoSource([])],
        publisher,
        queueStore,
      }).run();

      expect(result.newlyQueued).toBe(0);
      expect(result.postedVideoId).toBe('abc123');
      expect(publisher.calls).toHaveLength(1);
    });
  });
});
