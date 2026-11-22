import {
  PublishError,
  type FormattedPost,
  type FormattedTextPost,
  type Publisher,
} from '../application/ports.js';

/** The slice of @devvit/reddit's RedditClient this adapter uses, narrow enough for
 * tests to supply a plain fake. */
export interface RedditClientLike {
  submitPost(
    opts: {
      subredditName: string;
      title: string;
      runAs?: 'USER' | 'APP';
    } & ({ url: string } | { text: string }),
  ): Promise<{ id: string }>;
}

export class RedditPublisher implements Publisher {
  constructor(private readonly reddit: RedditClientLike) {}

  async submitLinkPost(subreddit: string, post: FormattedPost): Promise<string> {
    return this.submit(subreddit, { title: post.title, url: post.url });
  }

  async submitTextPost(subreddit: string, post: FormattedTextPost): Promise<string> {
    return this.submit(subreddit, { title: post.title, text: post.body });
  }

  private async submit(
    subreddit: string,
    content: { title: string } & ({ url: string } | { text: string }),
  ): Promise<string> {
    try {
      const submission = await this.reddit.submitPost({
        subredditName: subreddit,
        ...content,
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
