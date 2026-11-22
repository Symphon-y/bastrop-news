import { reddit } from '@devvit/reddit';
import { redis } from '@devvit/redis';
import { context, createServer, getServerPort } from '@devvit/server';
import express from 'express';
import { CheckAndPostUseCase } from './application/checkAndPost.js';
import { PostDailyDigestUseCase } from './application/postDailyDigest.js';
import type { VideoSource } from './application/ports.js';
import { CHANNEL_WATCHES } from './channelsConfig.js';
import { loadConfig, loadEventsConfig, resolveTargetSubreddit } from './config.js';
import { EVENTS_CALENDAR_ID, EVENTS_TIME_ZONE, publicCalendarUrl } from './eventsConfig.js';
import { AspectRatioVideoSource } from './infrastructure/aspectRatioVideoSource.js';
import { DailyDigestFormatter } from './infrastructure/dailyDigestFormatter.js';
import { GoogleCalendarEventSource } from './infrastructure/googleCalendarEventSource.js';
import { FilteredVideoSource } from './infrastructure/filteredVideoSource.js';
import { PassthroughFormatter } from './infrastructure/passthroughFormatter.js';
import { RedditPublisher } from './infrastructure/redditPublisher.js';
import { RedisDigestStore } from './infrastructure/redisDigestStore.js';
import { RedisVideoQueueStore } from './infrastructure/redisVideoQueueStore.js';
import {
  AcceptAllFilter,
  KeywordFilter,
  LandscapeOnlyFilter,
} from './infrastructure/videoFilters.js';
import { YoutubeDataApiSource } from './infrastructure/youtubeDataApiSource.js';

const app = express();
app.use(express.json());

app.post('/internal/scheduler/check-and-post', async (_req, res) => {
  try {
    const config = await loadConfig();
    const targetSubreddit = resolveTargetSubreddit(context.subredditName);

    const videoSources = CHANNEL_WATCHES.map((watch) => {
      const rawSource = new YoutubeDataApiSource(watch.channelId, config.youtubeApiKey);
      const filter =
        watch.keywords.length > 0 ? new KeywordFilter(watch.keywords) : new AcceptAllFilter();
      const source: VideoSource = new FilteredVideoSource(rawSource, filter);
      if (!watch.excludeVertical || !config.excludeVerticalVideos) return source;
      // Look up aspect ratios only for what survived the keyword filter. That call costs
      // a quota unit, and on most runs the news channels have no Bastrop story at all --
      // in which case the lookup is skipped entirely.
      return new FilteredVideoSource(
        new AspectRatioVideoSource(source, config.youtubeApiKey),
        new LandscapeOnlyFilter(),
      );
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

app.post('/internal/scheduler/daily-events-digest', async (_req, res) => {
  try {
    const config = await loadEventsConfig();
    if (!config.enabled) {
      res.json({ status: 'disabled' });
      return;
    }
    if (!EVENTS_CALENDAR_ID) {
      throw new Error('EVENTS_CALENDAR_ID in src/server/eventsConfig.ts is empty');
    }
    const targetSubreddit = resolveTargetSubreddit(context.subredditName);

    const useCase = new PostDailyDigestUseCase({
      eventSource: new GoogleCalendarEventSource(
        EVENTS_CALENDAR_ID,
        config.googleCalendarApiKey,
        EVENTS_TIME_ZONE,
      ),
      digestStore: new RedisDigestStore(redis),
      formatter: new DailyDigestFormatter(EVENTS_TIME_ZONE, publicCalendarUrl(EVENTS_CALENDAR_ID)),
      publisher: new RedditPublisher(reddit),
      subreddit: targetSubreddit,
      timeZone: EVENTS_TIME_ZONE,
      digestHour: config.digestHour,
      nowFn: () => new Date(),
      dryRun: config.dryRun,
    });

    const result = await useCase.run();
    if (result.wouldPost) {
      console.log(`would post digest "${result.wouldPost.title}":\n${result.wouldPost.body}`);
    }
    if (result.status !== 'not_due' && result.status !== 'already_posted') {
      console.log(
        `daily-events-digest ${result.localDate}: ${result.status} -> r/${targetSubreddit}` +
          `${config.dryRun ? ' (DRY RUN -- nothing posted)' : ''}`,
        { eventCount: result.eventCount },
      );
    }
    res.json({ localDate: result.localDate, status: result.status, eventCount: result.eventCount });
  } catch (error) {
    console.error('daily-events-digest run failed', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const server = createServer(app);
server.listen(getServerPort());
