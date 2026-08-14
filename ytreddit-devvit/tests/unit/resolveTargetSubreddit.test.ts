import { describe, expect, it } from 'vitest';
import { resolveTargetSubreddit } from '../../src/server/config.js';

describe('resolveTargetSubreddit', () => {
  it('posts to the subreddit the app is installed in', () => {
    expect(resolveTargetSubreddit('bastrop_test')).toBe('bastrop_test');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveTargetSubreddit('  BastropTX  ')).toBe('BastropTX');
  });

  it('never silently falls back to a hardcoded production subreddit', () => {
    // An earlier version defaulted to 'BastropTX', so a playtest install with dryRun
    // off would have aimed at production. Failing loudly is the correct outcome.
    expect(() => resolveTargetSubreddit(undefined)).toThrow(/Cannot determine target subreddit/);
    expect(() => resolveTargetSubreddit('')).toThrow(/Cannot determine target subreddit/);
    expect(() => resolveTargetSubreddit('   ')).toThrow(/Cannot determine target subreddit/);
  });
});
