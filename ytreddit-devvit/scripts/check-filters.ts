/**
 * Phase B2 diagnostic: what would the configured filters actually queue?
 *
 * Runs the app's real YoutubeDataApiSource + KeywordFilter against live channel
 * data and reports, per channel, which of the latest uploads would be queued --
 * and crucially whether each match came from the title or only from the
 * description. A pile of DESCRIPTION-ONLY matches means a station's boilerplate
 * footer mentions Bastrop, which would flood the subreddit.
 *
 *   node --experimental-strip-types scripts/check-filters.ts
 *
 * Reads YOUTUBE_API_KEY from .env.local (gitignored) or the environment.
 * The key is never printed.
 */
import { readFileSync } from 'node:fs';
import { CHANNEL_WATCHES } from '../src/server/channelsConfig.ts';
import { KeywordFilter } from '../src/server/infrastructure/videoFilters.ts';
import { YoutubeDataApiSource } from '../src/server/infrastructure/youtubeDataApiSource.ts';

function loadApiKey(): string {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const match = envFile.match(/^\s*YOUTUBE_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // fall through to the error below
  }
  throw new Error(
    'No API key. Copy .env.example to .env.local and set YOUTUBE_API_KEY, or export it.',
  );
}

const apiKey = loadApiKey();
let totalQueued = 0;
let descriptionOnlyMatches = 0;

for (const watch of CHANNEL_WATCHES) {
  const source = new YoutubeDataApiSource(watch.channelId, apiKey);
  const videos = await source.fetchLatest();
  const label = watch.keywords.length > 0 ? `keywords: ${watch.keywords.join(', ')}` : 'ALL uploads';
  console.log(`\n=== ${watch.channelId} (${label}) ===`);

  if (watch.keywords.length === 0) {
    totalQueued += videos.length;
    console.log(`  all ${videos.length} of the latest uploads would be queued (no filter)`);
    for (const video of videos.slice(0, 3)) console.log(`    - ${video.title.slice(0, 72)}`);
    continue;
  }

  const filter = new KeywordFilter(watch.keywords);
  const lowerKeywords = watch.keywords.map((k) => k.toLowerCase());
  let matched = 0;

  for (const video of videos) {
    if (!filter.matches(video)) continue;
    matched += 1;
    totalQueued += 1;
    const inTitle = lowerKeywords.some((k) => video.title.toLowerCase().includes(k));
    if (!inTitle) descriptionOnlyMatches += 1;
    console.log(`  MATCH [${inTitle ? 'TITLE' : 'DESCRIPTION-ONLY'}] ${video.title.slice(0, 72)}`);
  }

  console.log(`  ${matched}/${videos.length} of the latest uploads would be queued`);
}

console.log(`\n--- ${totalQueued} videos would be queued across all channels ---`);
if (descriptionOnlyMatches > 2) {
  console.log(
    `WARNING: ${descriptionOnlyMatches} matches came from the description alone.\n` +
      'That is the boilerplate-footer failure mode -- make KeywordFilter title-only\n' +
      'for the news channels before deploying.',
  );
} else {
  console.log('Filters look healthy: matches are title-driven, volume is low.');
}
