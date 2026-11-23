import { localDateToInstant } from '../application/localDay.js';
import type { EventSource } from '../application/ports.js';
import type { CalendarEvent } from '../domain/calendarEvent.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
/** The API maximum. The busiest day observed has about 20 events. */
const MAX_RESULTS = 250;

interface EventTime {
  dateTime?: string;
  date?: string;
}

export interface CalendarEventsResponse {
  items?: {
    id: string;
    status?: string;
    summary?: string;
    location?: string;
    start?: EventTime;
    end?: EventTime;
    source?: { url?: string };
    extendedProperties?: { shared?: { digestGroup?: string } };
  }[];
  nextPageToken?: string;
}

function toInstant(time: EventTime | undefined, timeZone: string): Date | null {
  if (time?.dateTime) return new Date(time.dateTime);
  if (time?.date) return localDateToInstant(time.date, timeZone);
  return null;
}

export function parseCalendarEvents(
  response: CalendarEventsResponse,
  timeZone: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const item of response.items ?? []) {
    if (item.status === 'cancelled') continue;
    const start = toInstant(item.start, timeZone);
    const end = toInstant(item.end, timeZone);
    if (start === null || end === null) continue;
    const digestGroup = item.extendedProperties?.shared?.digestGroup || undefined;
    events.push({
      id: item.id,
      title: item.summary?.trim() || '(untitled event)',
      url: item.source?.url ?? null,
      location: item.location?.trim() || null,
      start,
      end,
      allDay: item.start?.date !== undefined && item.start?.dateTime === undefined,
      ...(digestGroup ? { digestGroup } : {}),
    });
  }
  return events;
}

/** Reads a public Google Calendar with an API key; no OAuth is involved. */
export class GoogleCalendarEventSource implements EventSource {
  constructor(
    private readonly calendarId: string,
    private readonly apiKey: string,
    private readonly timeZone: string,
  ) {}

  async fetchEventsBetween(start: Date, end: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      // Expands any recurring event into its occurrences, which orderBy=startTime requires.
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(MAX_RESULTS),
      timeZone: this.timeZone,
    });
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Calendar events request failed: ${response.status}`);
    }
    const data = (await response.json()) as CalendarEventsResponse;
    if (data.nextPageToken) {
      console.warn(`calendar returned more than ${MAX_RESULTS} events for one day; extra pages ignored`);
    }
    return parseCalendarEvents(data, this.timeZone);
  }
}
