import { describe, expect, it, vi } from 'vitest';
import { PublishError } from '../../src/server/application/ports.js';
import { RedditPublisher } from '../../src/server/infrastructure/redditPublisher.js';

type HighlightablePost = { highlight(options?: object): Promise<void>; unhighlight(): Promise<void> };

function clientWith(post: HighlightablePost | Error) {
  return {
    submitPost: vi.fn(),
    getPostById: vi.fn(async (): Promise<HighlightablePost> => {
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

  it('adds a post to community highlights as an event, until the given time', async () => {
    const post = { highlight: vi.fn().mockResolvedValue(undefined), unhighlight: vi.fn() };
    const client = clientWith(post);
    const until = new Date('2026-11-24T15:00:00Z');

    await new RedditPublisher(client).highlight('t3_digest', until);

    expect(client.getPostById).toHaveBeenCalledWith('t3_digest');
    expect(post.highlight).toHaveBeenCalledWith({ highlightUntil: until, highlightLabelType: 'EVENT' });
  });

  it('removes a post from community highlights', async () => {
    const post = { highlight: vi.fn(), unhighlight: vi.fn().mockResolvedValue(undefined) };

    await new RedditPublisher(clientWith(post)).unhighlight('t3_digest');

    expect(post.unhighlight).toHaveBeenCalled();
  });

  it('translates highlight failures into PublishError', async () => {
    const publisher = new RedditPublisher(clientWith(new Error('not a moderator')));

    await expect(publisher.highlight('t3_digest', new Date())).rejects.toThrow(PublishError);
    await expect(publisher.unhighlight('t3_digest')).rejects.toThrow(PublishError);
  });
});
