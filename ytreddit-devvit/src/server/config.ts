import { settings } from '@devvit/settings';

export interface AppConfig {
  youtubeApiKey: string;
  /** Optional override. Blank means "post wherever this app is installed". */
  subredditName: string | undefined;
  minSecondsBetweenPosts: number;
  maxVideoAgeHours: number;
  dryRun: boolean;
}

const DEFAULT_MIN_SECONDS_BETWEEN_POSTS = 3600;
const DEFAULT_MAX_VIDEO_AGE_HOURS = 48;
/** Defaults to true so an install that hasn't been reviewed yet can't post on its own. */
const DEFAULT_DRY_RUN = true;

/**
 * Decides where to post. Defaulting to the installation's own subreddit means the
 * app cannot post somewhere it isn't installed -- a hardcoded default of 'BastropTX'
 * previously meant a playtest install would aim at production. The setting stays as
 * an escape hatch, but blank is the correct value for every normal install.
 */
export function resolveTargetSubreddit(
  settingValue: string | undefined,
  installedSubreddit: string | undefined,
): string {
  const override = settingValue?.trim();
  if (override) return override;
  const installed = installedSubreddit?.trim();
  if (installed) return installed;
  throw new Error(
    'Cannot determine target subreddit: the subredditName setting is blank and the ' +
      'request carries no install context.',
  );
}

export async function loadConfig(): Promise<AppConfig> {
  const youtubeApiKey = await settings.get<string>('youtubeApiKey');
  if (!youtubeApiKey) {
    throw new Error('youtubeApiKey setting is not configured -- run `devvit settings set youtubeApiKey`');
  }

  const subredditName = await settings.get<string>('subredditName');
  const minSecondsBetweenPosts =
    (await settings.get<number>('minSecondsBetweenPosts')) ?? DEFAULT_MIN_SECONDS_BETWEEN_POSTS;
  const maxVideoAgeHours = (await settings.get<number>('maxVideoAgeHours')) ?? DEFAULT_MAX_VIDEO_AGE_HOURS;
  const dryRun = (await settings.get<boolean>('dryRun')) ?? DEFAULT_DRY_RUN;

  return { youtubeApiKey, subredditName, minSecondsBetweenPosts, maxVideoAgeHours, dryRun };
}
