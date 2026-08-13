import { settings } from '@devvit/settings';

export interface AppConfig {
  youtubeApiKey: string;
  subredditName: string;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
}

const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = 3600;
const DEFAULT_MAX_VIDEO_AGE_HOURS = 48;
const DEFAULT_SUBREDDIT_NAME = 'BastropTX';

export async function loadConfig(): Promise<AppConfig> {
  const youtubeApiKey = await settings.get<string>('youtubeApiKey');
  if (!youtubeApiKey) {
    throw new Error('youtubeApiKey setting is not configured -- run `devvit settings set youtubeApiKey`');
  }

  const subredditName = (await settings.get<string>('subredditName')) ?? DEFAULT_SUBREDDIT_NAME;
  const minSecondsBetweenPosts =
    (await settings.get<number>('minSecondsBetweenPosts')) ?? DEFAULT_MIN_SECONDS_BETWEEN_POSTS;
  const maxVideoAgeHours = (await settings.get<number>('maxVideoAgeHours')) ?? DEFAULT_MAX_VIDEO_AGE_HOURS;

  return { youtubeApiKey, subredditName, minSecondsBetweenPosts, maxVideoAgeHours };
}
