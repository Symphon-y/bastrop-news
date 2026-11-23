import { describe, expect, it } from 'vitest';
import { buildDailyDigest } from '../../src/server/application/digestSchedule.js';
import { localDayBounds, nextLocalDay } from '../../src/server/application/localDay.js';
import type { CalendarEvent } from '../../src/server/domain/calendarEvent.js';
import {
  DailyDigestFormatter,
  escapeMarkdown,
  REDDIT_TEXT_MAX_LENGTH,
} from '../../src/server/infrastructure/dailyDigestFormatter.js';

const TZ = 'America/Chicago';
// Sunday Nov 22 2026, 8 AM CST.
const DAY = localDayBounds(new Date('2026-11-22T14:00:00Z'), TZ);
const NEXT = nextLocalDay(DAY, TZ);

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: `Event ${overrides.id}`,
    url: null,
    location: null,
    start: new Date('2026-11-22T18:00:00Z'),
    end: new Date('2026-11-22T19:00:00Z'),
    allDay: false,
    ...overrides,
  };
}

const digestOf = (events: CalendarEvent[]) => buildDailyDigest(DAY, NEXT, events);

const MARKET = event({
  id: 'market',
  title: 'Farmers & Makers Market',
  location: 'Hyperloop Plaza',
  allDay: true,
  start: new Date('2026-11-07T06:00:00Z'),
  end: new Date('2026-12-27T06:00:00Z'),
});
const TOMORROW_YOGA = event({
  id: 'yoga',
  title: 'Yoga',
  start: new Date('2026-11-23T13:45:00Z'),
  end: new Date('2026-11-23T14:45:00Z'),
});

describe('DailyDigestFormatter', () => {
  const formatter = new DailyDigestFormatter(TZ, 'https://calendar.google.com/calendar/embed?src=x');

  it('titles the post with the local date', () => {
    expect(formatter.format(digestOf([event({ id: 'a' })])).title).toBe(
      'Happening today in Bastrop County: Sunday, November 22',
    );
  });

  it('orders the sections Today, Ongoing, Tomorrow, with dated headings', () => {
    const { body } = formatter.format(digestOf([TOMORROW_YOGA, MARKET, event({ id: 'a' })]));

    const today = body.indexOf('### Today: Sunday, Nov 22');
    const ongoing = body.indexOf('### Ongoing');
    const tomorrow = body.indexOf('### Tomorrow: Monday, Nov 23');
    expect(today).toBe(0);
    expect(ongoing).toBeGreaterThan(today);
    expect(tomorrow).toBeGreaterThan(ongoing);
    expect(body.indexOf('Yoga')).toBeGreaterThan(tomorrow);
  });

  it('lists all-day events first in today, then timed events with 12-hour times', () => {
    const { body } = formatter.format(
      digestOf([
        event({ id: 'evening', title: 'Concert', start: new Date('2026-11-23T01:00:00Z'), end: new Date('2026-11-23T03:00:00Z') }),
        event({ id: 'noon', title: 'Lunch', url: 'https://example.com/l', location: 'Main St' }),
        event({ id: 'library', title: 'Library', allDay: true, start: DAY.start, end: DAY.end }),
      ]),
    );

    expect(body).toContain('* **All day**: Library\n* **12:00 PM**: [Lunch](https://example.com/l) · Main St\n* **7:00 PM**: Concert');
  });

  it('shows ongoing events compactly with their last day', () => {
    const { body } = formatter.format(digestOf([MARKET]));

    expect(body).toContain('### Ongoing\n* Farmers & Makers Market · Hyperloop Plaza · through Sat, Dec 26');
  });

  it('gives a multi-day event starting today its time and last day', () => {
    const { body } = formatter.format(
      digestOf([event({ id: 'fest', title: 'Fest', start: new Date('2026-11-22T16:00:00Z'), end: new Date('2026-11-25T00:00:00Z') })]),
    );

    expect(body).toContain('* **10:00 AM**: Fest · through Tue, Nov 24');
  });

  it('omits sections with no events', () => {
    const { body } = formatter.format(digestOf([event({ id: 'a' })]));

    expect(body).not.toContain('### Ongoing');
    expect(body).not.toContain('### Tomorrow');
  });

  it('links the source site\'s today, weekend and week pages', () => {
    const { body } = formatter.format(digestOf([event({ id: 'a' })]));

    expect(body).toContain(
      '**Plan ahead:** [Today](https://bastropcountycalendar.com/today) · ' +
        '[This weekend](https://bastropcountycalendar.com/this-weekend) · ' +
        '[This week](https://bastropcountycalendar.com/calendar/week)',
    );
  });

  it('credits the source and links the public calendar', () => {
    const { body } = formatter.format(digestOf([event({ id: 'a' })]));

    expect(body).toContain('[Bastrop County Calendar](https://bastropcountycalendar.com)');
    expect(body).toContain('[Subscribe to the calendar](https://calendar.google.com/calendar/embed?src=x)');
  });

  it('credits the City of Bastrop calendar only when its events are listed', () => {
    const county = formatter.format(digestOf([event({ id: 'a', url: 'https://bastropcountycalendar.com/events/a' })]));
    const withCity = formatter.format(
      digestOf([event({ id: 'c', url: 'https://connect.cityofbastrop.org/bastroptx/260230141' })]),
    );

    expect(county.body).not.toContain('City of Bastrop');
    expect(withCity.body).toContain(
      '*Events from [Bastrop County Calendar](https://bastropcountycalendar.com) and the ' +
        '[City of Bastrop Community Calendar](https://connect.cityofbastrop.org/bastroptx/calendar) · [Subscribe',
    );
  });

  it('summarizes worship services in one line per day, linking the Faith calendar', () => {
    const worship = (id: string, start: string) => event({ id, start: new Date(start), end: new Date(new Date(start).getTime() + 3_600_000), digestGroup: 'worship' });
    const { body } = formatter.format(
      digestOf([
        event({ id: 'a', title: 'Concert' }),
        worship('w1', '2026-11-22T15:00:00Z'),
        worship('w2', '2026-11-22T16:00:00Z'),
        worship('w3', '2026-11-23T15:00:00Z'),
      ]),
    );

    expect(body).toContain(
      '* **12:00 PM**: Concert\n* *⛪ 2 worship services today: [see the Faith calendar](https://bastropcountycalendar.com/categories/faith)*',
    );
    expect(body).toContain(
      '### Tomorrow: Monday, Nov 23\n* *⛪ 1 worship service tomorrow: [see the Faith calendar](https://bastropcountycalendar.com/categories/faith)*',
    );
    expect(body).not.toContain('w1');
  });

  it('escapes markdown in titles and venues', () => {
    const { body } = formatter.format(digestOf([event({ id: 'a', title: 'Trivia *Night* [21+]', location: 'Pub_House' })]));

    expect(body).toContain('Trivia \\*Night\\* \\[21+\\]');
    expect(body).toContain('Pub\\_House');
  });

  it('stays under the self-post limit and says how many were left out', () => {
    const many = Array.from({ length: 400 }, (_, i) => event({ id: String(i), title: 'x'.repeat(150) }));
    const { body } = formatter.format(digestOf(many));

    expect(body.length).toBeLessThanOrEqual(REDDIT_TEXT_MAX_LENGTH);
    expect(body).toMatch(/…and \d+ more on \[Bastrop County Calendar\]/);
    expect(body).toContain('**Plan ahead:**');
  });

  it('cuts tomorrow before today when the post is too long', () => {
    const today = Array.from({ length: 100 }, (_, i) => event({ id: `t${i}`, title: `today-${i} ${'x'.repeat(140)}` }));
    const tomorrow = Array.from({ length: 300 }, (_, i) =>
      event({ id: `n${i}`, title: `tomorrow-${i} ${'x'.repeat(140)}`, start: TOMORROW_YOGA.start, end: TOMORROW_YOGA.end }),
    );
    const { body } = formatter.format(digestOf([...tomorrow, ...today]));

    expect(body).toContain('today-99 ');
    expect(body).not.toContain('tomorrow-299 ');
  });
});

describe('escapeMarkdown', () => {
  it('leaves plain text alone', () => {
    expect(escapeMarkdown('Bastrop Farmers & Makers Market')).toBe('Bastrop Farmers & Makers Market');
  });
});
