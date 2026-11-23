import { PublishError, type PostPinner } from '../../src/server/application/ports.js';

export class FakePostPinner implements PostPinner {
  /** Every call in order, e.g. `unpin:t3_old`, `pin:t3_new`. */
  readonly calls: string[] = [];

  constructor(private readonly failOn: 'pin' | 'unpin' | null = null) {}

  async pin(postId: string): Promise<void> {
    this.calls.push(`pin:${postId}`);
    if (this.failOn === 'pin') throw new PublishError('simulated pin failure');
  }

  async unpin(postId: string): Promise<void> {
    this.calls.push(`unpin:${postId}`);
    if (this.failOn === 'unpin') throw new PublishError('simulated unpin failure');
  }
}
