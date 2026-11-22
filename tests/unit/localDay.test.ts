import { describe, expect, it } from 'vitest';
import { localDateToInstant, localDayBounds } from '../../src/server/application/localDay.js';

const TZ = 'America/Chicago';

describe('localDayBounds', () => {
  it('computes a standard-time day (UTC-6)', () => {
    const day = localDayBounds(new Date('2026-11-22T15:00:00Z'), TZ);
    expect(day.localDate).toBe('2026-11-22');
    expect(day.hour).toBe(9);
    expect(day.start.toISOString()).toBe('2026-11-22T06:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-11-23T06:00:00.000Z');
  });

  it('computes a daylight-time day (UTC-5)', () => {
    const day = localDayBounds(new Date('2026-07-04T12:00:00Z'), TZ);
    expect(day.localDate).toBe('2026-07-04');
    expect(day.hour).toBe(7);
    expect(day.start.toISOString()).toBe('2026-07-04T05:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-07-05T05:00:00.000Z');
  });

  it('treats late evening UTC as the same local day', () => {
    // 11:30 PM CST on Nov 22 is 05:30 UTC on Nov 23.
    expect(localDayBounds(new Date('2026-11-23T05:30:00Z'), TZ).localDate).toBe('2026-11-22');
    // 12:30 AM CST on Nov 23.
    expect(localDayBounds(new Date('2026-11-23T06:30:00Z'), TZ).localDate).toBe('2026-11-23');
  });

  it('makes the spring-forward day 23 hours long', () => {
    const day = localDayBounds(new Date('2027-03-14T18:00:00Z'), TZ);
    expect(day.start.toISOString()).toBe('2027-03-14T06:00:00.000Z');
    expect(day.end.toISOString()).toBe('2027-03-15T05:00:00.000Z');
  });

  it('makes the fall-back day 25 hours long', () => {
    const day = localDayBounds(new Date('2026-11-01T18:00:00Z'), TZ);
    expect(day.start.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });

  it('rolls over month and year ends', () => {
    const day = localDayBounds(new Date('2026-12-31T18:00:00Z'), TZ);
    expect(day.end.toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
});

describe('localDateToInstant', () => {
  it('returns local midnight', () => {
    expect(localDateToInstant('2026-11-22', TZ).toISOString()).toBe('2026-11-22T06:00:00.000Z');
  });

  it('rejects anything but YYYY-MM-DD', () => {
    expect(() => localDateToInstant('November 22', TZ)).toThrow();
  });
});
