import type { DigestStore } from '../../src/server/application/ports.js';

export class FakeDigestStore implements DigestStore {
  constructor(
    public lastDate: string | null = null,
    public highlightedId: string | null = null,
  ) {}

  async lastDigestDate(): Promise<string | null> {
    return this.lastDate;
  }

  async markDigestPosted(localDate: string): Promise<void> {
    this.lastDate = localDate;
  }

  async highlightedPostId(): Promise<string | null> {
    return this.highlightedId;
  }

  async setHighlightedPostId(postId: string | null): Promise<void> {
    this.highlightedId = postId;
  }
}
