import type { DigestStore } from '../../src/server/application/ports.js';

export class FakeDigestStore implements DigestStore {
  constructor(
    public lastDate: string | null = null,
    public pinnedId: string | null = null,
  ) {}

  async lastDigestDate(): Promise<string | null> {
    return this.lastDate;
  }

  async markDigestPosted(localDate: string): Promise<void> {
    this.lastDate = localDate;
  }

  async pinnedPostId(): Promise<string | null> {
    return this.pinnedId;
  }

  async setPinnedPostId(postId: string | null): Promise<void> {
    this.pinnedId = postId;
  }
}
