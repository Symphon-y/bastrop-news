import { PublishError, type FormattedPost, type Publisher } from '../application/ports.js';

/** The slice of @devvit/reddit's RedditClient this adapter uses, narrow enough for
 * tests to supply a plain fake. */
export interface RedditClientLike {
  submitPost(opts: {
    subredditName: string;
    title: string;
    url: string;
    runAs?: 'USER' | 'APP';
  }): Promise<{ id: string }>;
}

export class RedditPublisher implements Publisher {
  constructor(private readonly reddit: RedditClientLike) {}

  async submitLinkPost(subreddit: string, post: FormattedPost): Promise<string> {
    try {
      const submission = await this.reddit.submitPost({
        subredditName: subreddit,
        title: post.title,
        url: post.url,
        // Posts are attributed to the app account. Devvit's rules forbid automating
        // actions on behalf of a redditor, and every post here is scheduler-driven.
        runAs: 'APP',
      });
      return submission.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PublishError(`Failed to submit post to r/${subreddit}: ${message}`);
    }
  }
}
