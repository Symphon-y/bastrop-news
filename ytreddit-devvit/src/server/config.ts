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

/**
 * `devvit settings set` always transmits values as strings (it hardcodes
 * FormFieldType.STRING), so a setting declared BOOLEAN can come back as the string
 * "false" -- which is truthy. Without this, turning the dry-run kill switch off from
 * the CLI would appear to do nothing.
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

/** Same hazard as asBoolean: a NUMBER setting can arrive as a string. */
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
  const rawDryRun = await settings.get('dryRun');
  const dryRun = asBoolean(rawDryRun, DEFAULT_DRY_RUN);
  console.log(
    `dryRun setting: raw=${JSON.stringify(rawDryRun)} type=${typeof rawDryRun} -> resolved=${dryRun}`,
  );

  return { youtubeApiKey, minSecondsBetweenPosts, maxVideoAgeHours, dryRun };
}
