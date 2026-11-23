export interface LocalDay {
  /** `YYYY-MM-DD` in the given time zone. */
  readonly localDate: string;
  /** Local hour of the instant the day was computed from, 0-23. */
  readonly hour: number;
  /** UTC instant of local midnight starting this day. */
  readonly start: Date;
  /** UTC instant of local midnight starting the next day. Not always start + 24h: DST. */
  readonly end: Date;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Milliseconds the zone is ahead of UTC at `instant` (negative west of Greenwich). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * UTC instant of local midnight on the given calendar date. Month/day overflow is
 * normalised (day 32 rolls into the next month), which is how `end` is computed.
 * The offset is re-read at the candidate instant because the offset at UTC midnight
 * can differ from the offset at local midnight on a DST transition day.
 */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const naive = Date.UTC(year, month - 1, day);
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(firstGuess), timeZone));
}

export function localDayBounds(now: Date, timeZone: string): LocalDay {
  const p = zonedParts(now, timeZone);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return {
    localDate: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    hour: p.hour,
    start: zonedMidnight(p.year, p.month, p.day, timeZone),
    end: zonedMidnight(p.year, p.month, p.day + 1, timeZone),
  };
}

/** The local day after `day`. Its `hour` is 0, since no clock reading produced it. */
export function nextLocalDay(day: LocalDay, timeZone: string): LocalDay {
  return { ...localDayBounds(day.end, timeZone), hour: 0 };
}

/** Local midnight for a `YYYY-MM-DD` string, e.g. a Google Calendar all-day `date`. */
export function localDateToInstant(localDate: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${localDate}`);
  return zonedMidnight(Number(match[1]), Number(match[2]), Number(match[3]), timeZone);
}
