import type { CalendarEvent } from '../domain/calendarEvent.js';
import type { LocalDay } from './localDay.js';

export interface DigestEntry {
  readonly event: CalendarEvent;
  /** An instant on the event's last day when it runs for several days; otherwise null. */
  readonly through: Date | null;
}

export interface DailyDigest {
  readonly today: LocalDay;
  readonly tomorrow: LocalDay;
  /** Starting today: all-day events first, then timed ones by start. */
  readonly todayEvents: readonly DigestEntry[];
  /** Multi-day events that started before today, ending soonest first. */
  readonly ongoing: readonly DigestEntry[];
  /** Starting tomorrow, ordered like `todayEvents`. */
  readonly tomorrowEvents: readonly DigestEntry[];
}

/**
 * Longer than any local day (25 hours on the fall-back day), so a one-day all-day event
 * and an evening that runs past midnight both count as single-day.
 */
const MULTI_DAY_MS = 25 * 60 * 60 * 1000;

function isMultiDay(event: CalendarEvent): boolean {
  return event.end.getTime() - event.start.getTime() > MULTI_DAY_MS;
}

function toEntry(event: CalendarEvent): DigestEntry {
  // Ends are exclusive, so the last moment of the event is one millisecond earlier.
  return { event, through: isMultiDay(event) ? new Date(event.end.getTime() - 1) : null };
}

const startsWithin = (event: CalendarEvent, day: LocalDay): boolean =>
  event.start >= day.start && event.start < day.end;

function byDayOrder(a: DigestEntry, b: DigestEntry): number {
  if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
  return a.event.start.getTime() - b.event.start.getTime() || a.event.title.localeCompare(b.event.title);
}

function bySoonestEnd(a: DigestEntry, b: DigestEntry): number {
  return a.event.end.getTime() - b.event.end.getTime() || a.event.title.localeCompare(b.event.title);
}

/**
 * Sorts a day-and-a-half of calendar events into the digest's sections. Each event lands
 * in at most one: an event already running is "ongoing" rather than repeated under today,
 * and one starting tomorrow is not repeated under ongoing until the day after.
 */
export function buildDailyDigest(
  today: LocalDay,
  tomorrow: LocalDay,
  events: readonly CalendarEvent[],
): DailyDigest {
  const todayEvents: DigestEntry[] = [];
  const ongoing: DigestEntry[] = [];
  const tomorrowEvents: DigestEntry[] = [];

  for (const event of events) {
    if (startsWithin(event, today)) {
      todayEvents.push(toEntry(event));
    } else if (startsWithin(event, tomorrow)) {
      tomorrowEvents.push(toEntry(event));
    } else if (event.start < today.start && event.end > today.start && isMultiDay(event)) {
      // A short event left over from last night is over by the time the digest posts.
      ongoing.push(toEntry(event));
    }
  }

  return {
    today,
    tomorrow,
    todayEvents: todayEvents.sort(byDayOrder),
    ongoing: ongoing.sort(bySoonestEnd),
    tomorrowEvents: tomorrowEvents.sort(byDayOrder),
  };
}
