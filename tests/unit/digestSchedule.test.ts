import { describe, expect, it } from 'vitest';
import { buildDailyDigest } from '../../src/server/application/digestSchedule.js';
import { localDayBounds, nextLocalDay } from '../../src/server/application/localDay.js';
import type { CalendarEvent } from '../../src/server/domain/calendarEvent.js';

const TZ = 'America/Chicago';
// Sunday Nov 22 2026 (CST): local midnight is 06:00Z.
const TODAY = localDayBounds(new Date('2026-11-22T14:00:00Z'), TZ);
const TOMORROW = nextLocalDay(TODAY, TZ);

function event(id: string, start: string, end: string, allDay = false): CalendarEvent {
  return { id, title: id, url: null, location: null, start: new Date(start), end: new Date(end), allDay };
}

const ids = (entries: readonly { event: CalendarEvent }[]): string[] => entries.map((entry) => entry.event.id);

describe('buildDailyDigest', () => {
  it('puts events starting today in today, all-day ones first, then by start time', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('evening', '2026-11-23T01:00:00Z', '2026-11-23T03:00:00Z'),
      event('noon', '2026-11-22T18:00:00Z', '2026-11-22T19:00:00Z'),
      event('library', '2026-11-22T06:00:00Z', '2026-11-23T06:00:00Z', true),
    ]);

    expect(ids(digest.todayEvents)).toEqual(['library', 'noon', 'evening']);
    expect(digest.ongoing).toEqual([]);
    expect(digest.tomorrowEvents).toEqual([]);
  });

  it('treats a multi-day event that started before today as ongoing, soonest-ending first', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('market', '2026-11-07T06:00:00Z', '2026-12-27T06:00:00Z', true),
      event('lights', '2026-11-20T18:00:00Z', '2026-12-01T04:00:00Z'),
    ]);

    expect(ids(digest.ongoing)).toEqual(['lights', 'market']);
    expect(digest.todayEvents).toEqual([]);
  });

  it('gives multi-day events a through instant on their last day', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('market', '2026-11-07T06:00:00Z', '2026-12-27T06:00:00Z', true),
    ]);

    // The all-day end is exclusive (Dec 27 midnight), so the last day is Dec 26.
    expect(digest.ongoing[0].through?.toISOString()).toBe('2026-12-27T05:59:59.999Z');
  });

  it('gives single-day and overnight events no through date', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('library', '2026-11-22T06:00:00Z', '2026-11-23T06:00:00Z', true),
      // 8 PM to 1 AM: crosses midnight but is one outing.
      event('late-show', '2026-11-23T02:00:00Z', '2026-11-23T07:00:00Z'),
    ]);

    expect(digest.todayEvents.map((entry) => entry.through)).toEqual([null, null]);
  });

  it('keeps a multi-day event that starts today in today, with its through date', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('festival', '2026-11-22T16:00:00Z', '2026-11-25T00:00:00Z'),
    ]);

    expect(ids(digest.todayEvents)).toEqual(['festival']);
    expect(digest.todayEvents[0].through).not.toBeNull();
    expect(digest.ongoing).toEqual([]);
    expect(digest.tomorrowEvents).toEqual([]);
  });

  it('drops short events left over from last night', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('last-call', '2026-11-22T04:00:00Z', '2026-11-22T08:00:00Z'),
    ]);

    expect(digest.todayEvents).toEqual([]);
    expect(digest.ongoing).toEqual([]);
  });

  it('lists events starting tomorrow separately, including multi-day ones', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('yoga', '2026-11-23T13:45:00Z', '2026-11-23T14:45:00Z'),
      event('hayrides', '2026-11-23T06:00:00Z', '2026-11-30T06:00:00Z', true),
      event('today', '2026-11-22T18:00:00Z', '2026-11-22T19:00:00Z'),
    ]);

    expect(ids(digest.tomorrowEvents)).toEqual(['hayrides', 'yoga']);
    expect(digest.tomorrowEvents[0].through).not.toBeNull();
    expect(ids(digest.todayEvents)).toEqual(['today']);
  });

  it('ignores events outside the two days, at the exclusive boundaries', () => {
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      event('ended-at-midnight', '2026-11-21T06:00:00Z', '2026-11-22T06:00:00Z', true),
      event('day-after', '2026-11-24T06:00:00Z', '2026-11-25T06:00:00Z', true),
    ]);

    expect(digest.todayEvents).toEqual([]);
    expect(digest.ongoing).toEqual([]);
    expect(digest.tomorrowEvents).toEqual([]);
  });

  it('places every event in at most one section', () => {
    const events = [
      event('market', '2026-11-07T06:00:00Z', '2026-12-27T06:00:00Z', true),
      event('noon', '2026-11-22T18:00:00Z', '2026-11-22T19:00:00Z'),
      event('yoga', '2026-11-23T13:45:00Z', '2026-11-23T14:45:00Z'),
    ];
    const digest = buildDailyDigest(TODAY, TOMORROW, events);
    const all = [...digest.todayEvents, ...digest.ongoing, ...digest.tomorrowEvents].map((e) => e.event.id);

    expect(all.sort()).toEqual(['market', 'noon', 'yoga']);
  });

  it('counts worship services instead of listing them, for today and tomorrow', () => {
    const worship = (id: string, start: string, end: string) => ({ ...event(id, start, end), digestGroup: 'worship' });
    const digest = buildDailyDigest(TODAY, TOMORROW, [
      worship('mass', '2026-11-22T15:00:00Z', '2026-11-22T16:00:00Z'),
      worship('service', '2026-11-22T16:30:00Z', '2026-11-22T17:30:00Z'),
      worship('monday', '2026-11-23T15:00:00Z', '2026-11-23T16:00:00Z'),
      event('concert', '2026-11-22T18:00:00Z', '2026-11-22T19:00:00Z'),
    ]);

    expect(ids(digest.todayEvents)).toEqual(['concert']);
    expect(digest.todayWorship).toBe(2);
    expect(digest.tomorrowWorship).toBe(1);
    expect(digest.tomorrowEvents).toEqual([]);
  });

  it('treats an all-day event on the 25-hour fall-back day as a single day', () => {
    const fallBack = localDayBounds(new Date('2026-11-01T18:00:00Z'), TZ);
    const digest = buildDailyDigest(fallBack, nextLocalDay(fallBack, TZ), [
      event('fair', fallBack.start.toISOString(), fallBack.end.toISOString(), true),
    ]);

    expect(digest.todayEvents[0].through).toBeNull();
  });
});
