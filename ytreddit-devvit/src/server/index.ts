import { reddit } from '@devvit/reddit';
import { redis } from '@devvit/redis';
import { context, createServer, getServerPort } from '@devvit/server';
import express from 'express';
import { CheckAndPostUseCase } from './application/checkAndPost.js';
import { CHANNEL_WATCHES } from './channelsConfig.js';
import { loadConfig, resolveTargetSubreddit } from './config.js';
import { FilteredVideoSource } from './infrastructure/filteredVideoSource.js';
import { PassthroughFormatter } from './infrastructure/passthroughFormatter.js';
import { RedditPublisher } from './infrastructure/redditPublisher.js';
import { RedisVideoQueueStore } from './infrastructure/redisVideoQueueStore.js';
import { AcceptAllFilter, KeywordFilter } from './infrastructure/videoFilters.js';
import { YoutubeDataApiSource } from './infrastructure/youtubeDataApiSource.js';

const app = express();
app.use(express.json());

app.post('/internal/scheduler/check-and-post', async (_req, res) => {
  try {
    const config = await loadConfig();
    const targetSubreddit = resolveTargetSubreddit(config.subredditName, context.subredditName);

    const videoSources = CHANNEL_WATCHES.map((watch) => {
      const rawSource = new YoutubeDataApiSource(watch.channelId, config.youtubeApiKey);
      const filter =
        watch.keywords.length > 0 ? new KeywordFilter(watch.keywords) : new AcceptAllFilter();
      return new FilteredVideoSource(rawSource, filter);
    });

    const useCase = new CheckAndPostUseCase({
      videoSources,
      queueStore: new RedisVideoQueueStore(redis),
      formatter: new PassthroughFormatter(),
      publisher: new RedditPublisher(reddit),
      subreddit: targetSubreddit,
      minSecondsBetweenPosts: config.minSecondsBetweenPosts,
      maxVideoAgeHours: config.maxVideoAgeHours,
      nowFn: () => new Date(),
      dryRun: config.dryRun,
    });

    const result = await useCase.run();
    // Log every accepted video's title explicitly -- this is how a dry run surfaces an
    // over-broad keyword filter before it can flood the subreddit.
    for (const video of result.queuedThisRun) {
      console.log(`queued ${video.videoId}: ${video.title}`);
    }
    // Always state the resolved target -- posting to the wrong subreddit is the one
    // mistake that can't be undone quietly, so it should never be a guess.
    console.log(
      `check-and-post run complete -> r/${targetSubreddit}` +
        `${config.dryRun ? ' (DRY RUN -- nothing posted)' : ''}`,
      result,
    );
    res.json(result);
  } catch (error) {
    console.error('check-and-post run failed', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const server = createServer(app);
server.listen(getServerPort());
