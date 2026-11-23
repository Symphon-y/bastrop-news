import { describe, expect, it, vi } from 'vitest';
import { PublishError } from '../../src/server/application/ports.js';
import { RedditPublisher } from '../../src/server/infrastructure/redditPublisher.js';

type PinnablePost = { sticky(): Promise<void>; unsticky(): Promise<void> };

function clientWith(post: PinnablePost | Error) {
  return {
    submitPost: vi.fn(),
    getPostById: vi.fn(async (): Promise<PinnablePost> => {
      if (post instanceof Error) throw post;
      return post;
    }),
  };
}

function makePost() {
  return { title: 'New Bastrop Video', url: 'https://youtu.be/abc123' };
}

describe('RedditPublisher', () => {
  it('calls submitPost with the correct args and returns the submission id', async () => {
    const submitPost = vi.fn().mockResolvedValue({ id: 't3_xyz789' });
    const publisher = new RedditPublisher({ submitPost, getPostById: vi.fn() });

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
    const publisher = new RedditPublisher({ submitPost, getPostById: vi.fn() });

    await expect(publisher.submitLinkPost('BastropTX', makePost())).rejects.toThrow(PublishError);
  });

  it('submits a text post as the app account', async () => {
    const submitPost = vi.fn().mockResolvedValue({ id: 't3_digest' });
    const publisher = new RedditPublisher({ submitPost, getPostById: vi.fn() });

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
    const publisher = new RedditPublisher({ submitPost, getPostById: vi.fn() });

    await expect(publisher.submitTextPost('BastropTX', { title: 't', body: 'b' })).rejects.toThrow(
      PublishError,
    );
  });

  it('pins a post by stickying it', async () => {
    const post = { sticky: vi.fn().mockResolvedValue(undefined), unsticky: vi.fn() };
    const client = clientWith(post);

    await new RedditPublisher(client).pin('t3_digest');

    expect(client.getPostById).toHaveBeenCalledWith('t3_digest');
    expect(post.sticky).toHaveBeenCalledWith();
  });

  it('unpins a post by unstickying it', async () => {
    const post = { sticky: vi.fn(), unsticky: vi.fn().mockResolvedValue(undefined) };

    await new RedditPublisher(clientWith(post)).unpin('t3_digest');

    expect(post.unsticky).toHaveBeenCalled();
  });

  it('translates pin and unpin failures into PublishError', async () => {
    const publisher = new RedditPublisher(clientWith(new Error('not a moderator')));

    await expect(publisher.pin('t3_digest')).rejects.toThrow(PublishError);
    await expect(publisher.unpin('t3_digest')).rejects.toThrow(PublishError);
  });
});
