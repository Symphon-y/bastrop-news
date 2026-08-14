import { settings } from '@devvit/settings';

export interface AppConfig {
  youtubeApiKey: string;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
  dryRun: boolean;
}

const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = 3600;
const DEFAULT_MAX_VIDEO_AGE_HOURS = 48;
/** Defaults to true so an install that hasn't been reviewed yet can't post on its own. */
const DEFAULT_DRY_RUN = true;

/**
 * The app posts to the subreddit it is installed in, full stop -- there is no
 * configurable target. An earlier version defaulted to a hardcoded 'BastropTX',
 * which meant a playtest install would have aimed at production; a configurable
 * override was no better, since app settings are global and one set for the test
 * install would have followed the app to production. Deriving it from the install
 * makes posting to the wrong community structurally impossible.
 */
export function resolveTargetSubreddit(installedSubreddit: string | undefined): string {
  const installed = installedSubreddit?.trim();
  if (installed) return installed;
  throw new Error('Cannot determine target subreddit: the request carries no install context.');
}

export async function loadConfig(): Promise<AppConfig> {
  const youtubeApiKey = await settings.get<string>('youtubeApiKey');
  if (!youtubeApiKey) {
    throw new Error('youtubeApiKey setting is not configured -- run `devvit settings set youtubeApiKey`');
  }

  const minSecondsBetweenPosts =
    (await settings.get<number>('minSecondsBetweenPosts')) ?? DEFAULT_MIN_SECONDS_BETWEEN_POSTS;
  const maxVideoAgeHours = (await settings.get<number>('maxVideoAgeHours')) ?? DEFAULT_MAX_VIDEO_AGE_HOURS;
  const dryRun = (await settings.get<boolean>('dryRun')) ?? DEFAULT_DRY_RUN;

  return { youtubeApiKey, minSecondsBetweenPosts, maxVideoAgeHours, dryRun };
}
