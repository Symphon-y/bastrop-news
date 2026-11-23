import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadAppsScript } from '../fakes/appsScriptSandbox.js';

/**
 * Runs Sync.js's syncEvents() end to end against in-memory stand-ins for the Calendar
 * REST API, both event sources, and Script Properties.
 */
const TZ = 'America/Chicago';
const CALENDAR_ID = 'test-calendar@group.calendar.google.com';

function localDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

interface StoredEvent {
  id: string;
  status: string;
  [key: string]: any;
}

function makeWorld() {
  const calendar = { labels: [] as any[], events: new Map<string, StoredEvent>() };
  const properties = new Map<string, string>([['CALENDAR_ID', CALENDAR_ID]]);
  let countyEvents: any[] = [];
  let cityRecords: any[] = [];
  let cityStatus = 200;
  const requests: string[] = [];

  const respond = (code: number, body: unknown) => ({
    getResponseCode: () => code,
    getContentText: () => (body === undefined ? '' : JSON.stringify(body)),
  });

  const UrlFetchApp = {
    fetch(url: string, options: any = {}) {
      const method = (options.method || 'get').toLowerCase();
      requests.push(`${method} ${url.split('?')[0]}`);
      if (url.startsWith('https://bastropcountycalendar.com/api/public/events')) {
        return respond(200, { events: countyEvents, omitted: [] });
      }
      if (url.startsWith('https://api.withapps.io/')) {
        if (cityStatus !== 200) return respond(cityStatus, { status: 'NOK' });
        return respond(200, { data: { pagination: { currentPage: 1, totalPages: 1 }, records: cityRecords } });
      }
      const path = decodeURIComponent(url.replace('https://www.googleapis.com/calendar/v3/', '').split('?')[0]);
      const body = options.payload ? JSON.parse(options.payload) : undefined;
      if (path === `calendars/${CALENDAR_ID}`) {
        if (method === 'patch') calendar.labels = body.labelProperties.eventLabels;
        return respond(200, { labelProperties: { eventLabels: calendar.labels } });
      }
      const eventsPrefix = `calendars/${CALENDAR_ID}/events`;
      if (path === eventsPrefix && method === 'get') {
        return respond(200, { items: [...calendar.events.values()] });
      }
      if (path === eventsPrefix && method === 'post') {
        if (calendar.events.has(body.id)) return respond(409, { error: { message: 'duplicate' } });
        calendar.events.set(body.id, { ...body, status: 'confirmed' });
        return respond(200, body);
      }
      const id = path.slice(eventsPrefix.length + 1);
      const existing = calendar.events.get(id);
      if (!existing) return respond(404, { error: { message: 'not found' } });
      if (method === 'patch') {
        // Like the real API, PATCH merges nested objects field by field and a null clears
        // a field, so start/end can end up holding both `date` and `dateTime`.
        const merged: StoredEvent = { ...existing };
        for (const [key, value] of Object.entries(body)) {
          merged[key] =
            value && typeof value === 'object' && !Array.isArray(value) && existing[key] && typeof existing[key] === 'object'
              ? Object.fromEntries(Object.entries({ ...existing[key], ...value }).filter(([, v]) => v !== null))
              : value;
        }
        for (const edge of [merged.start, merged.end]) {
          if (edge?.date && edge?.dateTime) return respond(400, { error: { message: 'Invalid start time.' } });
        }
        calendar.events.set(id, merged);
        return respond(200, merged);
      }
      if (method === 'delete') {
        // Calendar keeps deleted events as cancelled, without their properties.
        calendar.events.set(id, { id, status: 'cancelled' });
        return respond(204, undefined);
      }
      throw new Error(`unexpected request ${method} ${url}`);
    },
  };

  const sandbox = loadAppsScript();
  const chicagoMidnight = (date: string): Date => {
    const guess = new Date(`${date}T06:00:00Z`);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(guess));
    return new Date(guess.getTime() - hour * 3_600_000);
  };
  Object.assign(sandbox, {
    UrlFetchApp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => properties.get(key) ?? null,
        setProperty: (key: string, value: string) => properties.set(key, value),
      }),
    },
    ScriptApp: { getOAuthToken: () => 'token' },
    console: { log: () => {}, warn: () => {} },
  });
  Object.assign(sandbox.Utilities, {
    formatDate: (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date),
    parseDate: (text: string) => chicagoMidnight(text.slice(0, 10)),
    sleep: () => {},
    getUuid: () => `uuid-${Math.random().toString(36).slice(2)}`,
  });
  vm.runInContext(readFileSync(new URL('../../apps-script/Sync.js', import.meta.url), 'utf8'), sandbox);

  return {
    calendar,
    properties,
    requests,
    sync: () => JSON.parse(JSON.stringify(sandbox.syncEvents())),
    setCounty: (events: any[]) => (countyEvents = events),
    setCity: (records: any[]) => (cityRecords = records),
    setCityStatus: (status: number) => (cityStatus = status),
    live: () => [...calendar.events.values()].filter((e) => e.status !== 'cancelled'),
  };
}

function countyEvent(id: string, title: string, day: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    url: `https://bastropcountycalendar.com/events/${id}`,
    title,
    summary: '',
    start: `${localDate(day)}T18:00:00`,
    end: `${localDate(day)}T19:00:00`,
    allDay: false,
    venue: 'Somewhere',
    address: '',
    category: 'community',
    status: 'active',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function cityRecord(resourceId: number, name: string, day: number, overrides: Record<string, unknown> = {}) {
  return {
    resourceId,
    name,
    startsAt: `${localDate(day)} 13:00`,
    endsAt: `${localDate(day)} 14:00`,
    timezone: TZ,
    isAllDay: null,
    isPrivateEvent: false,
    locationText: 'City Hall',
    description: '<p>Details</p>',
    leaderName: 'Bastrop Public Meetings',
    resourceUrl: `https://connect.cityofbastrop.org/bastroptx/${resourceId}?utm_source=bewith`,
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('syncEvents', () => {
  let world: ReturnType<typeof makeWorld>;

  beforeEach(() => {
    world = makeWorld();
    world.setCounty([countyEvent('opry', 'Main Street Advisory Board', 3), countyEvent('fair', 'Holiday Fair', 5)]);
    world.setCity([
      cityRecord(1, 'Regular City Council Meeting', 4),
      cityRecord(2, 'Main Street Advisory Board', 3),
      cityRecord(3, 'Regular City Council Meeting', 4),
    ]);
  });

  it('reads only the county until the city source is turned on', () => {
    world.sync();

    expect(world.live().map((e) => e.summary).sort()).toEqual(['Holiday Fair', 'Main Street Advisory Board']);
    expect(world.requests.some((r) => r.includes('withapps'))).toBe(false);
    expect(world.requests).toContain('get https://bastropcountycalendar.com/api/public/events');
  });

  it('adds city events, labelled, without duplicating county events', () => {
    world.properties.set('CITY_SOURCE_ENABLED', 'on');
    const counts = world.sync();

    expect(counts.created).toBe(3);
    expect(counts.duplicates).toBe(2);
    const council = world.live().find((e) => e.summary === 'Regular City Council Meeting')!;
    expect(council.id).toMatch(/^bcob[0-9a-f]{64}$/);
    expect(council.source).toEqual({
      title: 'City of Bastrop Community Calendar',
      url: 'https://connect.cityofbastrop.org/bastroptx/1',
    });
    const government = world.calendar.labels.find((l) => l.name === 'Government');
    expect(council.eventLabelId).toBe(government.id);
    expect(world.live().filter((e) => e.summary === 'Main Street Advisory Board')).toHaveLength(1);
  });

  it('is idempotent', () => {
    world.properties.set('CITY_SOURCE_ENABLED', 'on');
    world.sync();
    const second = world.sync();

    expect(second).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 3 });
  });

  it('leaves city events alone when the city source fails, and still syncs the county', () => {
    world.properties.set('CITY_SOURCE_ENABLED', 'on');
    world.sync();
    world.setCityStatus(500);
    world.setCounty([countyEvent('fair', 'Holiday Fair', 5)]);
    const counts = world.sync();

    expect(counts.skippedSources).toEqual(['cob']);
    expect(counts.deleted).toBe(1);
    expect(world.live().some((e) => e.summary === 'Regular City Council Meeting')).toBe(true);
  });

  it('leaves city events alone when the city source is switched off again', () => {
    world.properties.set('CITY_SOURCE_ENABLED', 'on');
    world.sync();
    world.properties.set('CITY_SOURCE_ENABLED', 'off');
    world.sync();

    expect(world.live().some((e) => e.summary === 'Regular City Council Meeting')).toBe(true);
  });

  it('never deletes a source\'s events because of an empty response', () => {
    world.properties.set('CITY_SOURCE_ENABLED', 'on');
    world.sync();
    world.setCity([]);
    const counts = world.sync();

    expect(counts.deleted).toBe(0);
  });

  it('switches an existing event between timed and all-day', () => {
    world.sync();
    world.setCounty([
      countyEvent('opry', 'Main Street Advisory Board', 3, { allDay: true, updatedAt: '2026-11-02T00:00:00Z' }),
      countyEvent('fair', 'Holiday Fair', 5),
    ]);
    expect(world.sync().updated).toBe(1);
    const board = world.live().find((e) => e.summary === 'Main Street Advisory Board')!;
    expect(board.start).toEqual({ date: localDate(3) });
    expect(board.end).toEqual({ date: localDate(4) });

    world.setCounty([countyEvent('opry', 'Main Street Advisory Board', 3, { updatedAt: '2026-11-03T00:00:00Z' })]);
    world.sync();
    const timed = world.live().find((e) => e.summary === 'Main Street Advisory Board')!;
    expect(timed.start).toEqual({ dateTime: `${localDate(3)}T18:00:00`, timeZone: TZ });
  });

  it('backfills the digest group on events synced before it existed', () => {
    world.setCounty([countyEvent('mass', 'Sacred Heart Sunday Worship', 3, { tags: ['worship'] })]);
    world.sync();
    const id = world.live()[0].id;
    // Simulate an event written by the previous version, without the shared property.
    world.calendar.events.set(id, { ...world.calendar.events.get(id)!, extendedProperties: { private: world.calendar.events.get(id)!.extendedProperties.private } });

    expect(world.sync().updated).toBe(1);
    expect(world.calendar.events.get(id)!.extendedProperties.shared).toEqual({ digestGroup: 'worship' });
    expect(world.sync().updated).toBe(0);
  });

  it('removes an event its source dropped, and does not recreate one a moderator deleted', () => {
    world.sync();
    world.setCounty([countyEvent('fair', 'Holiday Fair', 5)]);
    expect(world.sync().deleted).toBe(1);

    const fair = world.live().find((e) => e.summary === 'Holiday Fair')!;
    world.calendar.events.set(fair.id, { id: fair.id, status: 'cancelled' });
    const counts = world.sync();
    expect(counts.suppressed).toBe(1);
    expect(world.live()).toHaveLength(0);
  });
});
