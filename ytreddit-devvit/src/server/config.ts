import { settings } from '@devvit/settings';

export interface AppConfig {
  youtubeApiKey: string;
  subredditName: string;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
  dryRun: boolean;
}

const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = 3600;
const DEFAULT_MAX_VIDEO_AGE_HOURS = 48;
const DEFAULT_SUBREDDIT_NAME = 'BastropTX';
/** Defaults to true so an install that hasn't been reviewed yet can't post on its own. */
const DEFAULT_DRY_RUN = true;

export async function loadConfig(): Promise<AppConfig> {
  const youtubeApiKey = await settings.get<string>('youtubeApiKey');
  if (!youtubeApiKey) {
    throw new Error('youtubeApiKey setting is not configured -- run `devvit settings set youtubeApiKey`');
  }

  const subredditName = (await settings.get<string>('subredditName')) ?? DEFAULT_SUBREDDIT_NAME;
  const minSecondsBetweenPosts =
    (await settings.get<number>('minSecondsBetweenPosts')) ?? DEFAULT_MIN_SECONDS_BETWEEN_POSTS;
  const maxVideoAgeHours = (await settings.get<number>('maxVideoAgeHours')) ?? DEFAULT_MAX_VIDEO_AGE_HOURS;
  const dryRun = (await settings.get<boolean>('dryRun')) ?? DEFAULT_DRY_RUN;

  return { youtubeApiKey, subredditName, minSecondsBetweenPosts, maxVideoAgeHours, dryRun };
}
