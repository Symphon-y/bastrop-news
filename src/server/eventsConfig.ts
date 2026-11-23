/**
 * The public Google Calendar that `apps-script/` fills from bastropcountycalendar.com.
 * Checked in rather than a setting for the same reason as channelsConfig.ts: settings
 * are global to every install, and this changes rarely. The digest route refuses to
 * run if it is empty.
 */
export const EVENTS_CALENDAR_ID =
  '64f3a4b92fe6b7557de303387401e2e1b347a97a816bb023b4157f8cce256651@group.calendar.google.com';

export const SOURCE_SITE_URL = 'https://bastropcountycalendar.com';

/**
 * Sources the calendar is filled from, credited in a digest when any of its events
 * links to `pageUrlPrefix`. The county aggregator is always credited.
 */
export const CITY_SOURCE = {
  name: 'City of Bastrop Community Calendar',
  url: 'https://connect.cityofbastrop.org/bastroptx/calendar',
  pageUrlPrefix: 'https://connect.cityofbastrop.org/',
} as const;

/** Where the digest's worship-service count points. */
export const FAITH_CALENDAR_URL = 'https://bastropcountycalendar.com/categories/faith';

/** The source site's own filtered views, linked from every digest for planning ahead. */
export const SOURCE_SITE_LINKS: readonly { label: string; url: string }[] = [
  { label: 'Today', url: `${SOURCE_SITE_URL}/today` },
  { label: 'This weekend', url: `${SOURCE_SITE_URL}/this-weekend` },
  { label: 'This week', url: `${SOURCE_SITE_URL}/calendar/week` },
];

/** The source site's events carry naive local times in this zone. */
export const EVENTS_TIME_ZONE = 'America/Chicago';

export function publicCalendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=${encodeURIComponent(EVENTS_TIME_ZONE)}`;
}
