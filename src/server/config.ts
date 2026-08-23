import { settings } from '@devvit/settings';

export interface AppConfig {
  youtubeApiKey: string;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
  dryRun: boolean;
  excludeVerticalVideos: boolean;
}

const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = 3600;
const DEFAULT_MAX_VIDEO_AGE_HOURS = 48;
/** Defaults to true so an install that hasn't been reviewed yet can't post on its own. */
const DEFAULT_DRY_RUN = true;
/** Defaults to true because the duplicate Shorts are the reason this setting exists,
 * and the filter fails open, so leaving it on cannot silently suppress news. */
const DEFAULT_EXCLUDE_VERTICAL_VIDEOS = true;

/**
 * The app posts only to the subreddit it is installed in. There is deliberately no
 * configurable target: app settings are global to every install, so any override
 * would follow the app from one subreddit to another.
 */
export function resolveTargetSubreddit(installedSubreddit: string | undefined): string {
  const installed = installedSubreddit?.trim();
  if (installed) return installed;
  throw new Error('Cannot determine target subreddit: the request carries no install context.');
}

/**
 * `devvit settings set` transmits every value as a string (it hardcodes
 * FormFieldType.STRING), and the string "false" is truthy in JavaScript. Settings
 * that act as flags are therefore declared as strings and interpreted here.
 */
export function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return fallback;
}

/** Numeric settings arrive as strings for the same reason. */
export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function loadConfig(): Promise<AppConfig> {
  const youtubeApiKey = await settings.get<string>('youtubeApiKey');
  if (!youtubeApiKey) {
    throw new Error('youtubeApiKey setting is not configured -- run `devvit settings set youtubeApiKey`');
  }

  const minSecondsBetweenPosts = asNumber(
    await settings.get('minSecondsBetweenPosts'),
    DEFAULT_MIN_SECONDS_BETWEEN_POSTS,
  );
  const maxVideoAgeHours = asNumber(await settings.get('maxVideoAgeHours'), DEFAULT_MAX_VIDEO_AGE_HOURS);
  const dryRun = asBoolean(await settings.get('dryRun'), DEFAULT_DRY_RUN);
  const excludeVerticalVideos = asBoolean(
    await settings.get('excludeVerticalVideos'),
    DEFAULT_EXCLUDE_VERTICAL_VIDEOS,
  );

  return { youtubeApiKey, minSecondsBetweenPosts, maxVideoAgeHours, dryRun, excludeVerticalVideos };
}
