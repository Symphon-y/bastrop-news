import { PublishError, type FormattedPost, type Publisher } from '../application/ports.js';

/** The minimal slice of @devvit/reddit's RedditClient this adapter needs -- lets tests
 * inject a plain fake instead of needing Devvit's full plugin-mock test harness. */
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
        runAs: 'APP',
      });
      return submission.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PublishError(`Failed to submit post to r/${subreddit}: ${message}`);
    }
  }
}
