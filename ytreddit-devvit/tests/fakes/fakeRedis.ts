import type { RedisClientLike } from '../../src/server/infrastructure/redisVideoQueueStore.js';

/**
 * In-memory stand-in for the slice of @devvit/redis that RedisVideoQueueStore uses.
 * Deliberately mirrors the real client's contract on the two points the adapter
 * depends on: get() resolves to `undefined` (not null) for a missing key, and
 * zRange returns {member, score} objects sorted ascending by score.
 */
export class FakeRedis implements RedisClientLike {
  private readonly strings = new Map<string, string>();
  private readonly sortedSets = new Map<string, Map<string, number>>();

  async get(key: string): Promise<string | undefined> {
    return this.strings.get(key);
  }

  async set(key: string, value: string): Promise<string> {
    this.strings.set(key, value);
    return 'OK';
  }

  async zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number> {
    const set = this.sortedSets.get(key) ?? new Map<string, number>();
    this.sortedSets.set(key, set);
    let added = 0;
    for (const { member, score } of members) {
      if (!set.has(member)) added += 1;
      set.set(member, score);
    }
    return added;
  }

  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
  ): Promise<{ member: string; score: number }[]> {
    const set = this.sortedSets.get(key);
    if (!set) return [];
    const sorted = [...set.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
    // Redis rank ranges are inclusive and allow negative indices counting from the end.
    const resolve = (index: number): number => (index < 0 ? sorted.length + index : index);
    return sorted.slice(resolve(Number(start)), resolve(Number(stop)) + 1);
  }

  async zRem(key: string, members: string[]): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed += 1;
    }
    return removed;
  }

  /** Test-only: simulate a stored video expiring while its queue entry survives. */
  deleteString(key: string): void {
    this.strings.delete(key);
  }
}
