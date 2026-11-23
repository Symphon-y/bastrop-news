import { describe, expect, it } from 'vitest';
import { loadAppsScript } from '../fakes/appsScriptSandbox.js';

const sandbox = loadAppsScript();
const {
  parseSourceEvent,
  calendarIdFor,
  inWindow,
  toCalendarResource,
  addDays,
  canonicalCategory,
  normalizeLabelName,
  matchLabels,
  countyEventsUrl,
  countyRecords,
  sourceKeyForId,
  dedupeEvents,
  isOrphan,
  patchTime,
} = sandbox;
const CATEGORIES: { slug: string; shortName: string; siteLabel: string; color: string }[] =
  sandbox.evaluate('CATEGORIES');
const CATEGORY_ALIASES: Record<string, string> = sandbox.evaluate('CATEGORY_ALIASES');

/** A record in the shape of bastropcountycalendar.com/api/public/events. */
function record(overrides: Record<string, unknown>) {
  return {
    id: 'sean-orr-2026-11-22',
    slug: 'sean-orr-2026-11-22',
    url: 'https://bastropcountycalendar.com/events/sean-orr-2026-11-22',
    title: 'Sean Orr',
    summary: 'Live music',
    start: '2026-11-22T12:00:00',
    end: '2026-11-22T14:00:00',
    allDay: false,
    venue: "The Grace Miller \"Gracie's\"",
    address: '',
    category: 'music',
    status: 'active',
    updatedAt: '2026-11-22T21:00:32Z',
    ...overrides,
  };
}

describe('parseSourceEvent', () => {
  it('keeps naive local times and attaches the zone', () => {
    const event = parseSourceEvent(record({}));
    expect(event.start).toEqual({ dateTime: '2026-11-22T12:00:00', timeZone: 'America/Chicago' });
    expect(event.end).toEqual({ dateTime: '2026-11-22T14:00:00', timeZone: 'America/Chicago' });
    expect(event.allDay).toBe(false);
    expect(event.pageUrl).toBe('https://bastropcountycalendar.com/events/sean-orr-2026-11-22');
    expect(event.description).toBe('Live music\n\nhttps://bastropcountycalendar.com/events/sean-orr-2026-11-22');
    expect(event.location).toBe("The Grace Miller \"Gracie's\"");
  });

  it('gives a timed event with a date-only end one hour', () => {
    const event = parseSourceEvent(record({ end: '2026-11-22' }));
    expect(event.end.dateTime).toBe('2026-11-22T13:00:00');
  });

  it('gives a timed event with a null, empty, or earlier end one hour', () => {
    expect(parseSourceEvent(record({ end: null })).end.dateTime).toBe('2026-11-22T13:00:00');
    expect(parseSourceEvent(record({ end: '' })).end.dateTime).toBe('2026-11-22T13:00:00');
    expect(parseSourceEvent(record({ end: '2026-11-22T09:00:00' })).end.dateTime).toBe('2026-11-22T13:00:00');
  });

  it('rolls a late-evening default end into the next day', () => {
    const event = parseSourceEvent(record({ start: '2026-11-22T23:30:00', end: null }));
    expect(event.end.dateTime).toBe('2026-11-23T00:30:00');
  });

  it('preserves an explicit offset', () => {
    const event = parseSourceEvent(
      record({ start: '2026-12-01T18:00:00-06:00', end: '2026-12-01T20:00:00-06:00' }),
    );
    expect(event.start.dateTime).toBe('2026-12-01T18:00:00-06:00');
    expect(event.end.dateTime).toBe('2026-12-01T20:00:00-06:00');
  });

  it('defaults an offset start without a matching end to one hour, in UTC', () => {
    const event = parseSourceEvent(record({ start: '2026-12-01T18:00:00-06:00', end: '2026-12-01' }));
    expect(event.end.dateTime).toBe('2026-12-02T01:00:00Z');
  });

  it('makes a single-day all-day event end the next day (exclusive)', () => {
    const event = parseSourceEvent(record({ allDay: true, start: '2026-11-22T00:00:00', end: '2026-11-22' }));
    expect(event.allDay).toBe(true);
    expect(event.start).toEqual({ date: '2026-11-22' });
    expect(event.end).toEqual({ date: '2026-11-23' });
  });

  it('spans a multi-day all-day event through its last day', () => {
    const event = parseSourceEvent(record({ allDay: true, start: '2026-11-07T00:00:00', end: '2026-12-27' }));
    expect(event.end).toEqual({ date: '2026-12-28' });
  });

  it('treats a date-only start as all-day', () => {
    expect(parseSourceEvent(record({ start: '2026-11-22', end: null })).allDay).toBe(true);
  });

  it('rejects garbage dates, inactive records, and records without a title', () => {
    expect(parseSourceEvent(record({ start: 'January 1, 1863T00:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ start: 'December 9, 2026T19:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ start: '2026-13-40T00:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ status: 'cancelled' }))).toBeNull();
    expect(parseSourceEvent(record({ title: '  ' }))).toBeNull();
    expect(parseSourceEvent(null)).toBeNull();
  });

  it('uses the record\'s own page url, falling back to the slug', () => {
    expect(parseSourceEvent(record({ url: 'https://bastropcountycalendar.com/events/x' })).pageUrl).toBe(
      'https://bastropcountycalendar.com/events/x',
    );
    expect(parseSourceEvent(record({ url: null })).pageUrl).toBe(
      'https://bastropcountycalendar.com/events/sean-orr-2026-11-22',
    );
  });

  it('marks routine worship services so the digest can summarize them', () => {
    expect(parseSourceEvent(record({ tags: ['Bastrop', 'church', 'faith', 'worship'] })).digestGroup).toBe('worship');
    expect(parseSourceEvent(record({ tags: ['Bastrop'] })).digestGroup).toBe('');
    expect(parseSourceEvent(record({})).digestGroup).toBe('');
  });

  it('keeps the page URL at the end of a description it has to shorten', () => {
    const event = parseSourceEvent(record({ summary: 'x'.repeat(5000) }));
    expect(event.description.length).toBeLessThanOrEqual(4000);
    expect(event.description.endsWith('\n\nhttps://bastropcountycalendar.com/events/sean-orr-2026-11-22')).toBe(true);
  });

  it('tags the event with its source', () => {
    expect(parseSourceEvent(record({})).source).toBe('bcc');
  });

  it('prefers the street address for location', () => {
    expect(parseSourceEvent(record({ address: '904 Main St, Bastrop, TX' })).location).toBe(
      '904 Main St, Bastrop, TX',
    );
  });
});

describe('inWindow', () => {
  it('includes events touching the window, including ongoing multi-day ones', () => {
    const ongoing = parseSourceEvent(record({ allDay: true, start: '2026-11-07T00:00:00', end: '2026-12-27' }));
    const past = parseSourceEvent(record({ start: '2026-11-20T12:00:00', end: null }));
    const far = parseSourceEvent(record({ start: '2027-03-01T12:00:00', end: null }));

    expect(inWindow(ongoing, '2026-11-22', '2027-01-06')).toBe(true);
    expect(inWindow(past, '2026-11-22', '2027-01-06')).toBe(false);
    expect(inWindow(far, '2026-11-22', '2027-01-06')).toBe(false);
  });

  it('includes an all-day event ending today but not one that ended yesterday', () => {
    const endsToday = parseSourceEvent(record({ allDay: true, start: '2026-11-20T00:00:00', end: '2026-11-22' }));
    const endedYesterday = parseSourceEvent(record({ allDay: true, start: '2026-11-20T00:00:00', end: '2026-11-21' }));
    expect(inWindow(endsToday, '2026-11-22', '2027-01-06')).toBe(true);
    expect(inWindow(endedYesterday, '2026-11-22', '2027-01-06')).toBe(false);
  });
});

describe('calendarIdFor', () => {
  it('is deterministic and uses only base32hex characters', () => {
    const id = calendarIdFor('sean-orr-2026-11-22');
    expect(id).toBe(calendarIdFor('sean-orr-2026-11-22'));
    expect(id).not.toBe(calendarIdFor('sean-orr-2026-11-29'));
    expect(id).toMatch(/^bcc[0-9a-f]{64}$/);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it('uses the source\'s prefix, which must also be base32hex', () => {
    const id = calendarIdFor('cob:260228172', 'cob');
    expect(id).toMatch(/^bcob[0-9a-f]{64}$/);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});

describe('patchTime', () => {
  it('clears the other form so a patch can switch between timed and all-day', () => {
    expect(patchTime({ date: '2026-11-22' })).toEqual({ date: '2026-11-22', dateTime: null, timeZone: null });
    expect(patchTime({ dateTime: '2026-11-22T12:00:00', timeZone: 'America/Chicago' })).toEqual({
      date: null,
      dateTime: '2026-11-22T12:00:00',
      timeZone: 'America/Chicago',
    });
  });
});

describe('sourceKeyForId', () => {
  it('maps an event id back to the source that owns it', () => {
    expect(sourceKeyForId(calendarIdFor('x'))).toBe('bcc');
    expect(sourceKeyForId(calendarIdFor('cob:1', 'cob'))).toBe('cob');
    expect(sourceKeyForId('someoneelse123')).toBeNull();
  });
});

describe('countyEventsUrl and countyRecords', () => {
  it('asks the documented public API for just the sync window', () => {
    expect(countyEventsUrl('2026-11-22', '2027-01-06')).toBe(
      'https://bastropcountycalendar.com/api/public/events?from=2026-11-22&to=2027-01-06',
    );
  });

  it('unwraps the events array and rejects anything else', () => {
    expect(countyRecords({ events: [{ id: 'a' }], omitted: [] })).toEqual([{ id: 'a' }]);
    expect(() => countyRecords([{ id: 'a' }])).toThrow();
    expect(() => countyRecords({ error: 'x' })).toThrow();
  });
});

describe('dedupeEvents', () => {
  const county = (title: string, start: string) =>
    parseSourceEvent(record({ id: title + start, title, start, end: null }));
  const city = (title: string, start: string) => ({ ...county(title, start), source: 'cob', sourceId: 'cob:' + title + start });

  it('drops a later source\'s event with the same title on the same day', () => {
    const { kept, dropped } = dedupeEvents([
      county('Main Street Advisory Board', '2026-12-02T12:00:00'),
      city('Main Street Advisory Board', '2026-12-02T17:30:00'),
    ]);
    expect(kept.map((e: any) => e.source)).toEqual(['bcc']);
    expect(dropped).toBe(1);
  });

  it('ignores case and punctuation when comparing titles', () => {
    const { kept } = dedupeEvents([county('Farm Street Opry', '2026-12-03T19:00:00'), city('FARM STREET OPRY!', '2026-12-03T19:00:00')]);
    expect(kept).toHaveLength(1);
  });

  it('drops exact repeats within one source but keeps same-title events at other times', () => {
    const { kept } = dedupeEvents([
      city('Bastrop Fiber Arts', '2026-12-18 15:00'),
      city('Bastrop Fiber Arts', '2026-12-18 15:00'),
      city('Storytime', '2026-12-18 10:00'),
      city('Storytime', '2026-12-18 16:00'),
    ]);
    expect(kept).toHaveLength(3);
  });

  it('keeps the same title on different days', () => {
    const { kept } = dedupeEvents([county('Bingo', '2026-12-02T19:00:00'), city('Bingo', '2026-12-09T19:00:00')]);
    expect(kept).toHaveLength(2);
  });
});

describe('isOrphan', () => {
  const item = (overrides: Record<string, unknown>) => ({
    id: calendarIdFor('gone'),
    status: 'confirmed',
    start: { dateTime: '2026-11-25T18:00:00-06:00' },
    end: { dateTime: '2026-11-25T19:00:00-06:00' },
    extendedProperties: { private: { source: 'bcc', sourceId: 'gone' } },
    ...overrides,
  });
  const ok = { bcc: true };

  it('is true for an in-window event its source no longer lists', () => {
    expect(isOrphan(item({}), ok, {}, '2026-11-22', '2027-01-06')).toBe(true);
  });

  it('is false while the source still lists it', () => {
    expect(isOrphan(item({}), ok, { gone: true }, '2026-11-22', '2027-01-06')).toBe(false);
  });

  it('never removes events that already ended or lie past the window', () => {
    const ended = item({ start: { dateTime: '2026-11-21T18:00:00-06:00' }, end: { dateTime: '2026-11-21T19:00:00-06:00' } });
    const beyond = item({ start: { date: '2027-01-07' }, end: { date: '2027-01-08' } });
    expect(isOrphan(ended, ok, {}, '2026-11-22', '2027-01-06')).toBe(false);
    expect(isOrphan(beyond, ok, {}, '2026-11-22', '2027-01-06')).toBe(false);
  });

  it('leaves a source\'s events alone when that source was not fetched this run', () => {
    expect(isOrphan(item({}), {}, {}, '2026-11-22', '2027-01-06')).toBe(false);
    const cityItem = item({ id: calendarIdFor('cob:1', 'cob'), extendedProperties: { private: { source: 'cob', sourceId: 'cob:1' } } });
    expect(isOrphan(cityItem, ok, {}, '2026-11-22', '2027-01-06')).toBe(false);
  });

  it('skips cancelled entries and events without our properties', () => {
    expect(isOrphan(item({ status: 'cancelled' }), ok, {}, '2026-11-22', '2027-01-06')).toBe(false);
    expect(isOrphan(item({ extendedProperties: undefined }), ok, {}, '2026-11-22', '2027-01-06')).toBe(false);
  });
});

describe('toCalendarResource', () => {
  it('links the source page and records what is needed to detect changes', () => {
    const resource = toCalendarResource(parseSourceEvent(record({})));
    expect(resource.source).toEqual({
      title: 'Bastrop County Calendar',
      url: 'https://bastropcountycalendar.com/events/sean-orr-2026-11-22',
    });
    expect(resource.extendedProperties.private).toEqual({
      source: 'bcc',
      sourceId: 'sean-orr-2026-11-22',
      sourceUpdatedAt: '2026-11-22T21:00:32Z',
      sourceCategory: 'music',
    });
    expect(resource.id).toBeUndefined();
    expect(resource.eventLabelId).toBeUndefined();
  });

  it('shares the digest group, which public readers of the calendar can see', () => {
    const resource = toCalendarResource(parseSourceEvent(record({ tags: ['worship'] })), null);
    expect(resource.extendedProperties.shared).toEqual({ digestGroup: 'worship' });
    expect(toCalendarResource(parseSourceEvent(record({})), null).extendedProperties.shared).toEqual({ digestGroup: '' });
  });

  it('sets the label when given one', () => {
    expect(toCalendarResource(parseSourceEvent(record({})), 'label-uuid').eventLabelId).toBe('label-uuid');
  });

  it('records an empty sourceCategory for an unknown category', () => {
    const resource = toCalendarResource(parseSourceEvent(record({ category: 'mystery' })), null);
    expect(resource.extendedProperties.private.sourceCategory).toBe('');
  });
});

describe('canonicalCategory', () => {
  it('keeps the 12 canonical slugs', () => {
    for (const category of CATEGORIES) expect(canonicalCategory(category.slug)).toBe(category.slug);
  });

  it('folds every legacy slug into a canonical one', () => {
    const canonical = new Set(CATEGORIES.map((c) => c.slug));
    for (const [alias, target] of Object.entries(CATEGORY_ALIASES)) {
      expect(canonical.has(target)).toBe(true);
      expect(canonicalCategory(alias)).toBe(target);
    }
    expect(canonicalCategory('classes')).toBe('health-wellness');
    expect(canonicalCategory(' Family ')).toBe('family-kids');
  });

  it('returns null for unknown or missing slugs', () => {
    expect(canonicalCategory('mystery')).toBeNull();
    expect(canonicalCategory(null)).toBeNull();
    expect(canonicalCategory('')).toBeNull();
  });

  it('is what parseSourceEvent records', () => {
    expect(parseSourceEvent(record({ category: 'classes' })).category).toBe('health-wellness');
    expect(parseSourceEvent(record({ category: 'mystery' })).category).toBeNull();
  });
});

describe('normalizeLabelName', () => {
  it('lowercases, spells out &, drops punctuation, and singularizes', () => {
    expect(normalizeLabelName('Arts & Entertainment')).toEqual(['art', 'entertainment']);
    expect(normalizeLabelName('Sports/Outdoors!')).toEqual(['sport', 'outdoor']);
    expect(normalizeLabelName('Business')).toEqual(['business']);
  });
});

describe('matchLabels', () => {
  const label = (id: string, name: string) => ({ id, name, backgroundColor: '#000000' });
  const USER_LABELS = [
    label('l-arts', 'Arts'),
    label('l-music', 'Music'),
    label('l-community', 'Community'),
    label('l-markets', 'Markets'),
    label('l-family', 'Family'),
    label('l-outdoors', 'Outdoors'),
  ];

  it("reuses the owner's six labels and creates only the missing six", () => {
    const { bySlug, toCreate } = matchLabels(USER_LABELS);
    expect(bySlug).toEqual({
      'arts-entertainment': 'l-arts',
      music: 'l-music',
      community: 'l-community',
      'markets-shopping': 'l-markets',
      'family-kids': 'l-family',
      'sports-outdoors': 'l-outdoors',
    });
    expect(toCreate.map((c: { name: string }) => c.name).sort()).toEqual(
      ['Business', 'Education', 'Faith', 'Food', 'Government', 'Health'],
    );
  });

  it('creates all 12 on an empty calendar, with valid colors and names', () => {
    const { bySlug, toCreate } = matchLabels([]);
    expect(Object.keys(bySlug)).toHaveLength(0);
    expect(toCreate).toHaveLength(12);
    for (const entry of toCreate) {
      expect(entry.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeLessThanOrEqual(50);
    }
  });

  it('matches the full site name exactly, and partial names closely', () => {
    const { bySlug } = matchLabels([label('a', 'Family & Kids'), label('b', 'Health'), label('c', 'Kids')]);
    expect(bySlug['family-kids']).toBe('a');
    expect(bySlug['health-wellness']).toBe('b');
  });

  it('prefers an exact match over a close one regardless of order', () => {
    const { bySlug } = matchLabels([label('close', 'Kids'), label('exact', 'Family')]);
    expect(bySlug['family-kids']).toBe('exact');
  });

  it('tolerates a one-letter typo in a longer word', () => {
    expect(matchLabels([label('t', 'Comunity')]).bySlug.community).toBe('t');
    expect(matchLabels([label('t', 'Fod')]).bySlug['food-drink']).toBeUndefined();
  });

  it('does not match unrelated labels', () => {
    const { bySlug, toCreate } = matchLabels([label('x', 'Work'), label('y', 'Birthdays'), label('z', '')]);
    expect(Object.keys(bySlug)).toHaveLength(0);
    expect(toCreate).toHaveLength(12);
  });

  it('gives a label to at most one category', () => {
    const { bySlug } = matchLabels([label('only', 'Arts')]);
    const users = Object.values(bySlug).filter((id) => id === 'only');
    expect(users).toHaveLength(1);
  });

  it('notes when two labels fit a category equally well', () => {
    const { bySlug, notes } = matchLabels([label('first', 'Arts'), label('second', 'arts')]);
    expect(bySlug['arts-entertainment']).toBe('first');
    expect(notes).toHaveLength(1);

    const exactBeatsClose = matchLabels([label('a', 'Arts'), label('b', 'Entertainment')]);
    expect(exactBeatsClose.bySlug['arts-entertainment']).toBe('a');
    expect(exactBeatsClose.notes).toHaveLength(0);
  });

  it('ignores labels without an id', () => {
    expect(matchLabels([{ name: 'Music', backgroundColor: '#000000' }]).bySlug.music).toBeUndefined();
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
