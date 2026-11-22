/**
 * The public Google Calendar that `apps-script/` fills from bastropcountycalendar.com.
 * Checked in rather than a setting for the same reason as channelsConfig.ts: settings
 * are global to every install, and this changes rarely. The digest route refuses to
 * run if it is empty.
 */
export const EVENTS_CALENDAR_ID =
  '64f3a4b92fe6b7557de303387401e2e1b347a97a816bb023b4157f8cce256651@group.calendar.google.com';

/** The source site's events carry naive local times in this zone. */
export const EVENTS_TIME_ZONE = 'America/Chicago';

export function publicCalendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=${encodeURIComponent(EVENTS_TIME_ZONE)}`;
}
