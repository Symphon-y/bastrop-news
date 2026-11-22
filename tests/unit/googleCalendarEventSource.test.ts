import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleCalendarEventSource,
  parseCalendarEvents,
} from '../../src/server/infrastructure/googleCalendarEventSource.js';

const TZ = 'America/Chicago';

const FIXTURE = {
  items: [
    {
      id: 'timed1',
      status: 'confirmed',
      summary: 'Sean Orr',
      location: 'The Grace Miller',
      start: { dateTime: '2026-11-22T12:00:00-06:00' },
      end: { dateTime: '2026-11-22T14:00:00-06:00' },
      source: { title: 'Bastrop County Calendar', url: 'https://bastropcountycalendar.com/events/sean-orr-2026-11-22' },
    },
    {
      id: 'allday1',
      summary: 'Farmers Market',
      start: { date: '2026-11-07' },
      end: { date: '2026-12-28' },
    },
    { id: 'gone', status: 'cancelled' },
  ],
};

describe('parseCalendarEvents', () => {
  it('parses timed events with their source link', () => {
    const [timed] = parseCalendarEvents(FIXTURE, TZ);
    expect(timed).toEqual({
      id: 'timed1',
      title: 'Sean Orr',
      url: 'https://bastropcountycalendar.com/events/sean-orr-2026-11-22',
      location: 'The Grace Miller',
      start: new Date('2026-11-22T18:00:00Z'),
      end: new Date('2026-11-22T20:00:00Z'),
      allDay: false,
    });
  });

  it('parses all-day dates as local midnight and tolerates missing source/location', () => {
    const allDay = parseCalendarEvents(FIXTURE, TZ)[1];
    expect(allDay.allDay).toBe(true);
    expect(allDay.start.toISOString()).toBe('2026-11-07T06:00:00.000Z');
    expect(allDay.end.toISOString()).toBe('2026-12-28T06:00:00.000Z');
    expect(allDay.url).toBeNull();
    expect(allDay.location).toBeNull();
  });

  it('skips cancelled events and tolerates an empty response', () => {
    expect(parseCalendarEvents(FIXTURE, TZ).map((e) => e.id)).toEqual(['timed1', 'allday1']);
    expect(parseCalendarEvents({}, TZ)).toEqual([]);
  });
});

describe('GoogleCalendarEventSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests expanded, ordered events for the window with the API key', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const source = new GoogleCalendarEventSource('abc@group.calendar.google.com', 'fake-key', TZ);

    const events = await source.fetchEventsBetween(
      new Date('2026-11-22T06:00:00Z'),
      new Date('2026-11-23T06:00:00Z'),
    );

    expect(events).toHaveLength(2);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.host).toBe('www.googleapis.com');
    expect(url.pathname).toBe('/calendar/v3/calendars/abc%40group.calendar.google.com/events');
    expect(url.searchParams.get('key')).toBe('fake-key');
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('timeMin')).toBe('2026-11-22T06:00:00.000Z');
    expect(url.searchParams.get('timeMax')).toBe('2026-11-23T06:00:00.000Z');
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const source = new GoogleCalendarEventSource('abc', 'fake-key', TZ);

    await expect(source.fetchEventsBetween(new Date(), new Date())).rejects.toThrow('403');
  });
});
