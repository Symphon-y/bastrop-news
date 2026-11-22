import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * The apps-script files are plain Apps Script (global declarations, no module syntax)
 * that share one global scope, so they are evaluated together in a sandbox with a
 * stand-in for Utilities.
 */
const sandbox: Record<string, any> = {
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    // Apps Script returns signed bytes; mirror that so bytesToHex is exercised.
    computeDigest: (_algorithm: string, value: string) =>
      [...createHash('sha256').update(value, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
  },
};
vm.createContext(sandbox);
for (const file of ['Labels.js', 'Parse.js']) {
  vm.runInContext(readFileSync(new URL(`../../apps-script/${file}`, import.meta.url), 'utf8'), sandbox);
}
const {
  parseSourceEvent,
  calendarIdFor,
  inWindow,
  toCalendarResource,
  addDays,
  canonicalCategory,
  normalizeLabelName,
  matchLabels,
} = sandbox;
const CATEGORIES: { slug: string; shortName: string; siteLabel: string; color: string }[] = vm.runInContext(
  'CATEGORIES',
  sandbox,
);
const CATEGORY_ALIASES: Record<string, string> = vm.runInContext('CATEGORY_ALIASES', sandbox);

function record(overrides: Record<string, unknown>) {
  return {
    id: 'sean-orr-2026-11-22',
    title: 'Sean Orr',
    slug: 'sean-orr-2026-11-22',
    short_summary: 'Live music',
    start_datetime: '2026-11-22T12:00:00',
    end_datetime: '2026-11-22T14:00:00',
    all_day: 0,
    location_name: "The Grace Miller \"Gracie's\"",
    location_address: null,
    category: 'music',
    status: 'active',
    updated_at: '2026-11-22 21:00:32',
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
    const event = parseSourceEvent(record({ end_datetime: '2026-11-22' }));
    expect(event.end.dateTime).toBe('2026-11-22T13:00:00');
  });

  it('gives a timed event with a null, empty, or earlier end one hour', () => {
    expect(parseSourceEvent(record({ end_datetime: null })).end.dateTime).toBe('2026-11-22T13:00:00');
    expect(parseSourceEvent(record({ end_datetime: '' })).end.dateTime).toBe('2026-11-22T13:00:00');
    expect(parseSourceEvent(record({ end_datetime: '2026-11-22T09:00:00' })).end.dateTime).toBe('2026-11-22T13:00:00');
  });

  it('rolls a late-evening default end into the next day', () => {
    const event = parseSourceEvent(record({ start_datetime: '2026-11-22T23:30:00', end_datetime: null }));
    expect(event.end.dateTime).toBe('2026-11-23T00:30:00');
  });

  it('preserves an explicit offset', () => {
    const event = parseSourceEvent(
      record({ start_datetime: '2026-12-01T18:00:00-06:00', end_datetime: '2026-12-01T20:00:00-06:00' }),
    );
    expect(event.start.dateTime).toBe('2026-12-01T18:00:00-06:00');
    expect(event.end.dateTime).toBe('2026-12-01T20:00:00-06:00');
  });

  it('defaults an offset start without a matching end to one hour, in UTC', () => {
    const event = parseSourceEvent(record({ start_datetime: '2026-12-01T18:00:00-06:00', end_datetime: '2026-12-01' }));
    expect(event.end.dateTime).toBe('2026-12-02T01:00:00Z');
  });

  it('makes a single-day all-day event end the next day (exclusive)', () => {
    const event = parseSourceEvent(record({ all_day: 1, start_datetime: '2026-11-22T00:00:00', end_datetime: '2026-11-22' }));
    expect(event.allDay).toBe(true);
    expect(event.start).toEqual({ date: '2026-11-22' });
    expect(event.end).toEqual({ date: '2026-11-23' });
  });

  it('spans a multi-day all-day event through its last day', () => {
    const event = parseSourceEvent(record({ all_day: 1, start_datetime: '2026-11-07T00:00:00', end_datetime: '2026-12-27' }));
    expect(event.end).toEqual({ date: '2026-12-28' });
  });

  it('treats a date-only start as all-day', () => {
    expect(parseSourceEvent(record({ start_datetime: '2026-11-22', end_datetime: null })).allDay).toBe(true);
  });

  it('rejects garbage dates, inactive records, and records without a title', () => {
    expect(parseSourceEvent(record({ start_datetime: 'January 1, 1863T00:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ start_datetime: 'December 9, 2026T19:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ start_datetime: '2026-13-40T00:00:00' }))).toBeNull();
    expect(parseSourceEvent(record({ status: 'cancelled' }))).toBeNull();
    expect(parseSourceEvent(record({ title: '  ' }))).toBeNull();
    expect(parseSourceEvent(null)).toBeNull();
  });

  it('prefers the street address for location', () => {
    expect(parseSourceEvent(record({ location_address: '904 Main St, Bastrop, TX' })).location).toBe(
      '904 Main St, Bastrop, TX',
    );
  });
});

describe('inWindow', () => {
  it('includes events touching the window, including ongoing multi-day ones', () => {
    const ongoing = parseSourceEvent(record({ all_day: 1, start_datetime: '2026-11-07T00:00:00', end_datetime: '2026-12-27' }));
    const past = parseSourceEvent(record({ start_datetime: '2026-11-20T12:00:00', end_datetime: null }));
    const far = parseSourceEvent(record({ start_datetime: '2027-03-01T12:00:00', end_datetime: null }));

    expect(inWindow(ongoing, '2026-11-22', '2027-01-06')).toBe(true);
    expect(inWindow(past, '2026-11-22', '2027-01-06')).toBe(false);
    expect(inWindow(far, '2026-11-22', '2027-01-06')).toBe(false);
  });

  it('includes an all-day event ending today but not one that ended yesterday', () => {
    const endsToday = parseSourceEvent(record({ all_day: 1, start_datetime: '2026-11-20T00:00:00', end_datetime: '2026-11-22' }));
    const endedYesterday = parseSourceEvent(record({ all_day: 1, start_datetime: '2026-11-20T00:00:00', end_datetime: '2026-11-21' }));
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
      sourceUpdatedAt: '2026-11-22 21:00:32',
      sourceCategory: 'music',
    });
    expect(resource.id).toBeUndefined();
    expect(resource.eventLabelId).toBeUndefined();
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
