import { describe, expect, it } from 'vitest';
import { localDayBounds } from '../../src/server/application/localDay.js';
import type { CalendarEvent } from '../../src/server/domain/calendarEvent.js';
import {
  DailyDigestFormatter,
  escapeMarkdown,
  REDDIT_TEXT_MAX_LENGTH,
} from '../../src/server/infrastructure/dailyDigestFormatter.js';

const TZ = 'America/Chicago';
const DAY = localDayBounds(new Date('2026-11-22T14:00:00Z'), TZ);

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

describe('DailyDigestFormatter', () => {
  const formatter = new DailyDigestFormatter(TZ, 'https://calendar.google.com/calendar/embed?src=x');

  it('titles the post with the local date', () => {
    expect(formatter.format(DAY, [event({ id: 'a' })]).title).toBe(
      'Happening today in Bastrop County: Sunday, November 22',
    );
  });

  it('lists ongoing events first, then timed events in start order with 12-hour times', () => {
    const { body } = formatter.format(DAY, [
      event({ id: 'evening', title: 'Concert', start: new Date('2026-11-23T01:00:00Z'), end: new Date('2026-11-23T03:00:00Z') }),
      event({ id: 'noon', title: 'Lunch', start: new Date('2026-11-22T18:00:00Z'), url: 'https://example.com/l', location: 'Main St' }),
      event({ id: 'market', title: 'Market', allDay: true, start: DAY.start, end: DAY.end }),
      event({ id: 'multi', title: 'Lights', start: new Date('2026-11-20T18:00:00Z'), end: new Date('2026-12-31T18:00:00Z') }),
    ]);

    const ongoing = body.indexOf('### All day / ongoing');
    const today = body.indexOf('### Today');
    expect(ongoing).toBeGreaterThanOrEqual(0);
    expect(today).toBeGreaterThan(ongoing);
    expect(body.indexOf('Market')).toBeLessThan(today);
    expect(body.indexOf('Lights')).toBeLessThan(today);
    expect(body).toContain('* **12:00 PM**: [Lunch](https://example.com/l) · Main St');
    expect(body).toContain('* **7:00 PM**: Concert');
    expect(body.indexOf('Lunch')).toBeLessThan(body.indexOf('Concert'));
  });

  it('omits a section with no events', () => {
    const { body } = formatter.format(DAY, [event({ id: 'a' })]);
    expect(body).not.toContain('All day / ongoing');
  });

  it('credits the source and links the public calendar', () => {
    const { body } = formatter.format(DAY, [event({ id: 'a' })]);
    expect(body).toContain('[Bastrop County Calendar](https://bastropcountycalendar.com)');
    expect(body).toContain('[Subscribe to the calendar](https://calendar.google.com/calendar/embed?src=x)');
  });

  it('escapes markdown in titles and venues', () => {
    const { body } = formatter.format(DAY, [event({ id: 'a', title: 'Trivia *Night* [21+]', location: 'Pub_House' })]);
    expect(body).toContain('Trivia \\*Night\\* \\[21+\\]');
    expect(body).toContain('Pub\\_House');
  });

  it('stays under the self-post limit and says how many were left out', () => {
    const many = Array.from({ length: 400 }, (_, i) => event({ id: String(i), title: 'x'.repeat(150) }));
    const { body } = formatter.format(DAY, many);

    expect(body.length).toBeLessThanOrEqual(REDDIT_TEXT_MAX_LENGTH);
    expect(body).toMatch(/…and \d+ more on \[Bastrop County Calendar\]/);
  });
});

describe('escapeMarkdown', () => {
  it('leaves plain text alone', () => {
    expect(escapeMarkdown("Bastrop Farmers & Makers Market")).toBe('Bastrop Farmers & Makers Market');
  });
});
