import { describe, expect, it } from 'vitest';
import { asBoolean, asHour, asNumber } from '../../src/server/config.js';

describe('asBoolean', () => {
  it('passes real booleans through', () => {
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
  });

  it('reads the strings `devvit settings set` actually sends', () => {
    expect(asBoolean('false', true)).toBe(false);
    expect(asBoolean('FALSE', true)).toBe(false);
    expect(asBoolean(' off ', true)).toBe(false);
    expect(asBoolean('0', true)).toBe(false);
    expect(asBoolean('no', true)).toBe(false);
    expect(asBoolean('true', false)).toBe(true);
    expect(asBoolean('on', false)).toBe(true);
    expect(asBoolean('1', false)).toBe(true);
  });

  it('falls back when the value is missing or unintelligible', () => {
    expect(asBoolean(undefined, true)).toBe(true);
    expect(asBoolean(null, true)).toBe(true);
    expect(asBoolean('', true)).toBe(true);
    expect(asBoolean('maybe', true)).toBe(true);
    expect(asBoolean('maybe', false)).toBe(false);
  });

  it('defaults dry-run on for anything ambiguous, keeping silence the safe failure', () => {
    expect(asBoolean('nonsense', true)).toBe(true);
  });
});

describe('asNumber', () => {
  it('passes finite numbers through', () => {
    expect(asNumber(3600, 60)).toBe(3600);
    expect(asNumber(0, 60)).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(asNumber('3600', 60)).toBe(3600);
    expect(asNumber(' 120 ', 60)).toBe(120);
  });

  it('falls back on junk rather than producing NaN', () => {
    expect(asNumber(undefined, 60)).toBe(60);
    expect(asNumber('', 60)).toBe(60);
    expect(asNumber('soon', 60)).toBe(60);
    expect(asNumber(Number.NaN, 60)).toBe(60);
    expect(asNumber(Number.POSITIVE_INFINITY, 60)).toBe(60);
  });
});

describe('asHour', () => {
  it('accepts whole hours 0-23, including as strings', () => {
    expect(asHour('0', 7)).toBe(0);
    expect(asHour(23, 7)).toBe(23);
    expect(asHour(' 9 ', 7)).toBe(9);
  });

  it('falls back on anything that is not a clock hour', () => {
    expect(asHour('24', 7)).toBe(7);
    expect(asHour(-1, 7)).toBe(7);
    expect(asHour('7.5', 7)).toBe(7);
    expect(asHour('seven', 7)).toBe(7);
    expect(asHour(undefined, 7)).toBe(7);
  });
});
