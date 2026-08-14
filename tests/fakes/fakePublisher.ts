import { PublishError, type FormattedPost, type Publisher } from '../../src/server/application/ports.js';

export class FakePublisher implements Publisher {
  readonly calls: { subreddit: string; post: FormattedPost }[] = [];

  constructor(private readonly fail = false) {}

  async submitLinkPost(subreddit: string, post: FormattedPost): Promise<string> {
    if (this.fail) {
      throw new PublishError('simulated publish failure');
    }
    this.calls.push({ subreddit, post });
    return 'fake-submission-id';
  }
}
