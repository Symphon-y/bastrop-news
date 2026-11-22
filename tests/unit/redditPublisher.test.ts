import { describe, expect, it, vi } from 'vitest';
import { PublishError } from '../../src/server/application/ports.js';
import { RedditPublisher } from '../../src/server/infrastructure/redditPublisher.js';

function makePost() {
  return { title: 'New Bastrop Video', url: 'https://youtu.be/abc123' };
}

describe('RedditPublisher', () => {
  it('calls submitPost with the correct args and returns the submission id', async () => {
    const submitPost = vi.fn().mockResolvedValue({ id: 't3_xyz789' });
    const publisher = new RedditPublisher({ submitPost });

    const result = await publisher.submitLinkPost('BastropTX', makePost());

    expect(submitPost).toHaveBeenCalledWith({
      subredditName: 'BastropTX',
      title: 'New Bastrop Video',
      url: 'https://youtu.be/abc123',
      runAs: 'APP',
    });
    expect(result).toBe('t3_xyz789');
  });

  it('translates a submitPost failure into a PublishError', async () => {
    const submitPost = vi.fn().mockRejectedValue(new Error('rate limited'));
    const publisher = new RedditPublisher({ submitPost });

    await expect(publisher.submitLinkPost('BastropTX', makePost())).rejects.toThrow(PublishError);
  });

  it('submits a text post as the app account', async () => {
    const submitPost = vi.fn().mockResolvedValue({ id: 't3_digest' });
    const publisher = new RedditPublisher({ submitPost });

    const result = await publisher.submitTextPost('BastropTX', { title: 'Happening today', body: '* Event' });

    expect(submitPost).toHaveBeenCalledWith({
      subredditName: 'BastropTX',
      title: 'Happening today',
      text: '* Event',
      runAs: 'APP',
    });
    expect(result).toBe('t3_digest');
  });

  it('translates a text-post failure into a PublishError', async () => {
    const submitPost = vi.fn().mockRejectedValue(new Error('rate limited'));
    const publisher = new RedditPublisher({ submitPost });

    await expect(publisher.submitTextPost('BastropTX', { title: 't', body: 'b' })).rejects.toThrow(
      PublishError,
    );
  });
});
