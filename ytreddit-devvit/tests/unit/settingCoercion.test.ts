import { describe, expect, it } from 'vitest';
import { asBoolean, asNumber } from '../../src/server/config.js';

describe('asBoolean', () => {
  it('passes real booleans through', () => {
    expect(asBoolean(true, false)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
  });

  it('reads the strings `devvit settings set` actually sends', () => {
    // The CLI hardcodes FormFieldType.STRING, so a BOOLEAN setting arrives as text.
    // "false" is truthy in JS -- without coercion the kill switch could never be
    // turned off from the CLI.
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

  it('defaults dry-run ON for anything ambiguous, so silence is the safe failure', () => {
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
