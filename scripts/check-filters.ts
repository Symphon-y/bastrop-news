/**
 * Reports what the configured filters would queue right now, running the app's own
 * YoutubeDataApiSource and KeywordFilter against live channel data.
 *
 * Each match is labelled TITLE or DESCRIPTION-ONLY. Many DESCRIPTION-ONLY matches
 * mean a channel's boilerplate description footer mentions a keyword, which would
 * queue every one of its uploads.
 *
 * Videos are also labelled VERTICAL where the channel has excludeVertical set, so the
 * duplicate Shorts the filter removes are visible before deploying a change.
 *
 *   npm run check:filters
 *
 * Reads YOUTUBE_API_KEY from the environment or a gitignored local dotenv file.
 * The key is never printed.
 */
import { readFileSync } from 'node:fs';
import { CHANNEL_WATCHES } from '../src/server/channelsConfig.ts';
import { AspectRatioVideoSource } from '../src/server/infrastructure/aspectRatioVideoSource.ts';
import { KeywordFilter, LandscapeOnlyFilter } from '../src/server/infrastructure/videoFilters.ts';
import { YoutubeDataApiSource } from '../src/server/infrastructure/youtubeDataApiSource.ts';

function loadApiKey(): string {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  for (const filename of ['../.env.local', '../.env']) {
    try {
      const envFile = readFileSync(new URL(filename, import.meta.url), 'utf8');
      const match = envFile.match(/^\s*(?:export\s+)?YOUTUBE_API_KEY\s*=\s*(.+)$/m);
      if (match) {
        const key = match[1].trim().replace(/^["']|["']$/g, '');
        if (key) return key;
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    'No YOUTUBE_API_KEY found in the environment, .env.local, or .env (both gitignored).',
  );
}

/** Mirrors config.ts's default; the deployed value is a Devvit setting. */
const MAX_VIDEO_AGE_HOURS = 48;

const apiKey = loadApiKey();
const cutoff = new Date(Date.now() - MAX_VIDEO_AGE_HOURS * 60 * 60 * 1000);
let totalQueued = 0;
let descriptionOnlyMatches = 0;
let totalVerticalsDropped = 0;

function ageLabel(publishedAt: Date): string {
  const hours = (Date.now() - publishedAt.getTime()) / (60 * 60 * 1000);
  const age = hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
  return publishedAt >= cutoff ? `${age}` : `${age}, TOO OLD`;
}

const landscapeOnly = new LandscapeOnlyFilter();

for (const watch of CHANNEL_WATCHES) {
  const rawSource = new YoutubeDataApiSource(watch.channelId, apiKey);
  // Unlike the deployed app, enrich every upload rather than only the keyword survivors:
  // this is a manual diagnostic, and seeing the orientation of everything is the point.
  const source = watch.excludeVertical
    ? new AspectRatioVideoSource(rawSource, apiKey)
    : rawSource;
  const videos = await source.fetchLatest();
  const label = watch.keywords.length > 0 ? `keywords: ${watch.keywords.join(', ')}` : 'ALL uploads';
  console.log(`\n=== ${watch.channelId} (${label}) ===`);

  const filter = watch.keywords.length > 0 ? new KeywordFilter(watch.keywords) : null;
  const lowerKeywords = watch.keywords.map((k) => k.toLowerCase());
  let passedFilter = 0;
  let queued = 0;
  let verticalsDropped = 0;

  for (const video of videos) {
    if (filter && !filter.matches(video)) continue;
    passedFilter += 1;
    const dropped = watch.excludeVertical && !landscapeOnly.matches(video);
    const withinWindow = video.publishedAt >= cutoff;
    if (dropped) {
      if (withinWindow) {
        verticalsDropped += 1;
        totalVerticalsDropped += 1;
      }
    } else if (withinWindow) {
      queued += 1;
      totalQueued += 1;
    }

    let tag = 'no filter';
    if (filter) {
      const inTitle = lowerKeywords.some((k) => video.title.toLowerCase().includes(k));
      if (!inTitle && withinWindow) descriptionOnlyMatches += 1;
      tag = inTitle ? 'TITLE' : 'DESCRIPTION-ONLY';
    }
    const shape =
      video.aspectRatio === undefined
        ? ''
        : dropped
          ? ` [${video.aspectRatio.toFixed(2)} VERTICAL -> DROPPED]`
          : ` [${video.aspectRatio.toFixed(2)}]`;
    // only the ones that would really be queued are worth listing in full
    if (withinWindow || !filter) {
      console.log(`  [${tag}] (${ageLabel(video.publishedAt)})${shape} ${video.title.slice(0, 64)}`);
    }
  }

  console.log(
    `  ${passedFilter}/${videos.length} passed the filter; ` +
      `${queued} also within the ${MAX_VIDEO_AGE_HOURS}h age window -> would actually queue` +
      `${watch.excludeVertical ? ` (${verticalsDropped} vertical duplicates dropped)` : ''}`,
  );

  // How far back does one fetch reach? If this is smaller than the scheduler's
  // 15-minute interval, uploads scroll out of view between runs and are missed.
  const oldest = videos.at(-1);
  if (oldest) {
    const coverageHours = (Date.now() - oldest.publishedAt.getTime()) / (60 * 60 * 1000);
    const margin = coverageHours / 0.25;
    console.log(
      `  fetch depth covers ${coverageHours < 48 ? `${coverageHours.toFixed(1)}h` : `${(coverageHours / 24).toFixed(1)}d`} of uploads ` +
        `(${margin.toFixed(0)}x the 15-minute poll interval)${margin < 4 ? '  <-- TIGHT' : ''}`,
    );
  }
}

console.log(
  `\n--- ${totalQueued} videos would actually be queued right now ` +
    `(${totalVerticalsDropped} vertical duplicates dropped) ---`,
);
console.log(
  `(fetch depth is 15 videos per channel, so anything older than the 15th most recent\n` +
    ` upload is invisible regardless of the ${MAX_VIDEO_AGE_HOURS}h window)`,
);
if (descriptionOnlyMatches > 2) {
  console.log(
    `WARNING: ${descriptionOnlyMatches} matches came from the description alone.\n` +
      'That is the boilerplate-footer failure mode -- make KeywordFilter title-only\n' +
      'for the news channels before deploying.',
  );
} else {
  console.log('Filters look healthy: matches are title-driven, volume is low.');
}
