import { PublishError, type PostHighlighter } from '../../src/server/application/ports.js';

export class FakePostHighlighter implements PostHighlighter {
  /** Every call in order, e.g. `unhighlight:t3_old`, `highlight:t3_new`. */
  readonly calls: string[] = [];
  /** The expiry passed with each highlight call. */
  readonly until: Date[] = [];

  constructor(private readonly failOn: 'highlight' | 'unhighlight' | null = null) {}

  async highlight(postId: string, until: Date): Promise<void> {
    this.calls.push(`highlight:${postId}`);
    this.until.push(until);
    if (this.failOn === 'highlight') throw new PublishError('simulated highlight failure');
  }

  async unhighlight(postId: string): Promise<void> {
    this.calls.push(`unhighlight:${postId}`);
    if (this.failOn === 'unhighlight') throw new PublishError('simulated unhighlight failure');
  }
}
