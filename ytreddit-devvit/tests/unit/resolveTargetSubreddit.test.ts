import { describe, expect, it } from 'vitest';
import { resolveTargetSubreddit } from '../../src/server/config.js';

describe('resolveTargetSubreddit', () => {
  it('posts to the subreddit the app is installed in when no override is set', () => {
    expect(resolveTargetSubreddit(undefined, 'bastrop_test')).toBe('bastrop_test');
  });

  it('treats a blank or whitespace-only override as unset', () => {
    expect(resolveTargetSubreddit('', 'bastrop_test')).toBe('bastrop_test');
    expect(resolveTargetSubreddit('   ', 'bastrop_test')).toBe('bastrop_test');
  });

  it('honours an explicit override', () => {
    expect(resolveTargetSubreddit('SomewhereElse', 'bastrop_test')).toBe('SomewhereElse');
  });

  it('trims a padded override', () => {
    expect(resolveTargetSubreddit('  BastropTX  ', 'bastrop_test')).toBe('BastropTX');
  });

  it('never silently falls back to a hardcoded production subreddit', () => {
    // The old behaviour defaulted to 'BastropTX', so a playtest install with dryRun
    // off would have aimed at production. Failing loudly is the correct outcome.
    expect(() => resolveTargetSubreddit(undefined, undefined)).toThrow(
      /Cannot determine target subreddit/,
    );
    expect(() => resolveTargetSubreddit('  ', '')).toThrow(/Cannot determine target subreddit/);
  });
});
