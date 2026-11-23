import { describe, expect, it } from 'vitest';
import { loadAppsScript } from '../fakes/appsScriptSandbox.js';

const { parseCityRecord, cityPageUrl, collectCityPages, expandGenericTitle, htmlToText, cityCategory, inWindow } =
  loadAppsScript();

/** Trimmed from a real api.withapps.io resources/published record (2026-11-22). */
function cityRecord(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: 260228172,
    name: 'Sewing Group',
    startsAt: '2026-11-23 13:00',
    endsAt: '2026-11-23 16:00',
    startsAtUtc: '2026-11-23T19:00:00.000Z',
    endsAtUtc: '2026-11-23T22:00:00.000Z',
    timezone: 'America/Chicago',
    isAllDay: null,
    isPrivateEvent: false,
    locationText: '1100 Church Street, Bastrop, TX, USA',
    description:
      '<p><span style="color:rgb(0,0,0);">Do you have a half-finished sewing or quilting project? Bring it to our new Sewing &amp; Quilting Group! </span></p>',
    plainDescription: 'do you have a half-finished sewing or quilting project? bring it to our new sewing & quilting group! ',
    leaderName: 'Bastrop Public Library',
    resourceUrl: 'https://connect.cityofbastrop.org/bastroptx/260228172?utm_source=bewith&utm_medium=calendar',
    updatedAt: '2026-11-10T18:35:43.406Z',
    isRecurring: true,
    ...overrides,
  };
}

describe('parseCityRecord', () => {
  it('normalizes a record into the shared event shape, in local time', () => {
    const event = parseCityRecord(cityRecord());

    expect(event).toMatchObject({
      source: 'cob',
      sourceId: 'cob:260228172',
      title: 'Sewing Group at Bastrop Public Library',
      location: '1100 Church Street, Bastrop, TX, USA',
      pageUrl: 'https://connect.cityofbastrop.org/bastroptx/260228172',
      updatedAt: '2026-11-10T18:35:43.406Z',
      allDay: false,
      start: { dateTime: '2026-11-23T13:00:00', timeZone: 'America/Chicago' },
      end: { dateTime: '2026-11-23T16:00:00', timeZone: 'America/Chicago' },
    });
  });

  it('builds the description from the HTML, keeping capitalization, and credits the organizer', () => {
    expect(parseCityRecord(cityRecord()).description).toBe(
      'Do you have a half-finished sewing or quilting project? Bring it to our new Sewing & Quilting Group!\n\n' +
        'Hosted by Bastrop Public Library.\n\nhttps://connect.cityofbastrop.org/bastroptx/260228172',
    );
  });

  it('dates an evening event by its local day, not its UTC day', () => {
    const trivia = parseCityRecord(
      cityRecord({
        name: 'TRIVIA',
        leaderName: 'Bastrop Beer Company',
        startsAt: '2026-11-26 19:00',
        endsAt: '2026-11-26 21:00',
        startsAtUtc: '2026-11-27T01:00:00.000Z',
        endsAtUtc: '2026-11-27T03:00:00.000Z',
      }),
    );
    expect(trivia.start.dateTime).toBe('2026-11-26T19:00:00');
    expect(inWindow(trivia, '2026-11-26', '2026-11-26')).toBe(true);
  });

  it('falls back to the UTC fields when the record is in another zone', () => {
    const event = parseCityRecord(cityRecord({ timezone: 'America/New_York' }));
    expect(event.start.dateTime).toBe('2026-11-23T19:00:00Z');
  });

  it('makes all-day events span whole days', () => {
    const event = parseCityRecord(cityRecord({ isAllDay: true, startsAt: '2026-12-04 00:00', endsAt: '2026-12-05 23:59' }));
    expect(event.start).toEqual({ date: '2026-12-04' });
    expect(event.end).toEqual({ date: '2026-12-06' });
  });

  it('gives an event with no usable end one hour', () => {
    expect(parseCityRecord(cityRecord({ endsAt: null })).end.dateTime).toBe('2026-11-23T14:00:00');
  });

  it('rejects private, untitled, and undated records', () => {
    expect(parseCityRecord(cityRecord({ isPrivateEvent: true }))).toBeNull();
    expect(parseCityRecord(cityRecord({ name: ' ' }))).toBeNull();
    expect(parseCityRecord(cityRecord({ startsAt: null }))).toBeNull();
    expect(parseCityRecord(cityRecord({ resourceId: undefined }))).toBeNull();
    expect(parseCityRecord(null)).toBeNull();
  });

  it('labels it by organizer and title', () => {
    expect(parseCityRecord(cityRecord()).category).toBe('education');
    expect(parseCityRecord(cityRecord({ name: 'Regular City Council Meeting', leaderName: 'Bastrop Public Meetings' })).category).toBe(
      'government-civic',
    );
  });
});

describe('expandGenericTitle', () => {
  it('adds the organizer to short titles that need it', () => {
    expect(expandGenericTitle('TRIVIA', 'Bastrop Beer Company')).toBe('TRIVIA at Bastrop Beer Company');
    expect(expandGenericTitle('Happy Hour!', 'Film Alley')).toBe('Happy Hour! at Film Alley');
  });

  it('leaves descriptive titles, titles naming the organizer, and city meetings alone', () => {
    expect(expandGenericTitle('Christmas Movie in the Park', 'Bastrop Parks & Recreation')).toBe('Christmas Movie in the Park');
    expect(expandGenericTitle('Eden East Farm Stand', 'Eden East Farm')).toBe('Eden East Farm Stand');
    expect(expandGenericTitle('Library Board', 'Bastrop Public Meetings')).toBe('Library Board');
    expect(expandGenericTitle('Bingo', '')).toBe('Bingo');
  });
});

describe('htmlToText', () => {
  it('strips tags, decodes entities, and keeps paragraph breaks', () => {
    expect(htmlToText('<p>Fish &amp; Chips&nbsp;night</p><p>Bring &quot;friends&quot; &#39;n kids</p>')).toBe(
      'Fish & Chips night\n\nBring "friends" \'n kids',
    );
    expect(htmlToText(null)).toBe('');
  });
});

describe('cityCategory', () => {
  it.each([
    ['Regular City Council Meeting', 'Bastrop Public Meetings', 'government-civic'],
    ['Zoning Board of Adjustments', 'Bastrop Public Meetings', 'government-civic'],
    ['Wine Not? Wednesdays + Live Music', 'Store House Market & Eatery', 'music'],
    ['Farm Street Opry', 'Discover Bastrop', 'music'],
    ["Bastrop 1832 Farmer's Market", 'Bastrop 1832 Farmers Market', 'markets-shopping'],
    ['Eden East Farm Stand', 'Eden East Farm', 'markets-shopping'],
    ['Tween D&D', 'Bastrop Public Library', 'family-kids'],
    ['Preschool Storytime', 'Bastrop Public Library', 'family-kids'],
    ['TRIVIA', 'Bastrop Beer Company', 'arts-entertainment'],
    ['Christmas Movie in the Park: The Polar Express', 'Bastrop Parks & Recreation', 'arts-entertainment'],
    ['Little Hike', 'Bird City Bastrop Texas', 'sports-outdoors'],
    ['Burger Night', 'Store House Market & Eatery', 'food-drink'],
    ['Knitters Nook', 'Bastrop Public Library', 'education'],
    ['Lighting of the Pines', 'Bastrop Parks & Recreation', 'community'],
  ])('%s (%s) -> %s', (title, organizer, expected) => {
    expect(cityCategory(title, organizer)).toBe(expected);
  });

  it('returns null when nothing fits', () => {
    expect(cityCategory('Something', 'Someone')).toBeNull();
  });
});

describe('cityPageUrl', () => {
  it('requests published, dated events for the window, one page at a time', () => {
    expect(cityPageUrl(1795327200, 1799301599, 2)).toBe(
      'https://api.withapps.io/api/v2/organizations/56/communities/261/resources/published' +
        '?filterBy%5BstartsAt%5D=1795327200&filterBy%5BendsAt%5D=1799301599&filterBy%5BonlyDated%5D=true' +
        '&filterBy%5BincludeSpanning%5D=true&filterBy%5BresourceType%5D%5B0%5D=regular&pageSize=50&page=2',
    );
  });
});

describe('collectCityPages', () => {
  const page = (n: number, total: number, records: unknown[]) => ({
    data: { pagination: { currentPage: n, totalPages: total }, records },
  });

  it('follows pagination to the last page', () => {
    const requested: number[] = [];
    const records = collectCityPages((n: number) => {
      requested.push(n);
      return page(n, 3, [{ resourceId: n }]);
    });
    expect(requested).toEqual([1, 2, 3]);
    expect(records.map((r: any) => r.resourceId)).toEqual([1, 2, 3]);
  });

  it('stops at the page cap even if the API claims more', () => {
    const requested: number[] = [];
    collectCityPages((n: number) => {
      requested.push(n);
      return page(n, 999, [{}]);
    });
    expect(requested).toHaveLength(10);
  });

  it('rejects a response that is not the expected shape', () => {
    expect(() => collectCityPages(() => ({ status: 'NOK' }))).toThrow();
  });
});
