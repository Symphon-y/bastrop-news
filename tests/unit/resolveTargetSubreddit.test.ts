import { describe, expect, it } from 'vitest';
import { resolveTargetSubreddit } from '../../src/server/config.js';

describe('resolveTargetSubreddit', () => {
  it('posts to the subreddit the app is installed in', () => {
    expect(resolveTargetSubreddit('bastrop_test')).toBe('bastrop_test');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveTargetSubreddit('  BastropTX  ')).toBe('BastropTX');
  });

  it('throws rather than guessing a subreddit', () => {
    expect(() => resolveTargetSubreddit(undefined)).toThrow(/Cannot determine target subreddit/);
    expect(() => resolveTargetSubreddit('')).toThrow(/Cannot determine target subreddit/);
    expect(() => resolveTargetSubreddit('   ')).toThrow(/Cannot determine target subreddit/);
  });
});
