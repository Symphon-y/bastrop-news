import {
  PublishError,
  type FormattedPost,
  type FormattedTextPost,
  type PostHighlighter,
  type Publisher,
} from '../application/ports.js';

type PostId = `t3_${string}`;

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
  getPostById(id: PostId): Promise<HighlightablePost>;
}

/** The slice of @devvit/reddit's Post used for community highlights. */
interface HighlightablePost {
  highlight(options?: { highlightUntil?: Date; highlightLabelType?: 'EVENT' }): Promise<void>;
  unhighlight(): Promise<void>;
}

export class RedditPublisher implements Publisher, PostHighlighter {
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

  /**
   * Community highlights replaced sticky posts: up to six per subreddit, each with a
   * label and an optional expiry. The digest is labelled an event.
   */
  async highlight(postId: string, until: Date): Promise<void> {
    await this.moderate(postId, 'highlight', (post) =>
      post.highlight({ highlightUntil: until, highlightLabelType: 'EVENT' }),
    );
  }

  async unhighlight(postId: string): Promise<void> {
    await this.moderate(postId, 'unhighlight', (post) => post.unhighlight());
  }

  private async moderate(
    postId: string,
    action: string,
    apply: (post: HighlightablePost) => Promise<void>,
  ): Promise<void> {
    try {
      await apply(await this.reddit.getPostById(postId as PostId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PublishError(`Failed to ${action} post ${postId}: ${message}`);
    }
  }
}
