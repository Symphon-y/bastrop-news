import {
  PublishError,
  type FormattedPost,
  type FormattedTextPost,
  type Publisher,
} from '../../src/server/application/ports.js';

export class FakePublisher implements Publisher {
  readonly calls: { subreddit: string; post: FormattedPost }[] = [];
  readonly textCalls: { subreddit: string; post: FormattedTextPost }[] = [];

  constructor(private readonly fail = false) {}

  async submitLinkPost(subreddit: string, post: FormattedPost): Promise<string> {
    if (this.fail) {
      throw new PublishError('simulated publish failure');
    }
    this.calls.push({ subreddit, post });
    return 'fake-submission-id';
  }

  async submitTextPost(subreddit: string, post: FormattedTextPost): Promise<string> {
    if (this.fail) {
      throw new PublishError('simulated publish failure');
    }
    this.textCalls.push({ subreddit, post });
    return 'fake-submission-id';
  }
}
