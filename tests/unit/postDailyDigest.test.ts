import { describe, expect, it } from 'vitest';
import type { DigestFormatter, EventSource, Publisher } from '../../src/server/application/ports.js';
import { PostDailyDigestUseCase } from '../../src/server/application/postDailyDigest.js';
import type { CalendarEvent } from '../../src/server/domain/calendarEvent.js';
import { DailyDigestFormatter } from '../../src/server/infrastructure/dailyDigestFormatter.js';
import { FakeDigestStore } from '../fakes/fakeDigestStore.js';
import { FakeEventSource } from '../fakes/fakeEventSource.js';
import { FakePostPinner } from '../fakes/fakePostPinner.js';
import { FakePublisher } from '../fakes/fakePublisher.js';

const TZ = 'America/Chicago';
// 8:00 AM CST, Sunday Nov 22 2026.
const MORNING = new Date('2026-11-22T14:00:00Z');

function makeEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, title: `Event ${id}`, url: null, location: null, start: new Date(start), end: new Date(end), allDay: false };
}

const TODAY_EVENT = makeEvent('a', '2026-11-22T18:00:00Z', '2026-11-22T19:00:00Z');

function makeUseCase(options: {
  now?: Date;
  eventSource?: EventSource;
  digestStore?: FakeDigestStore;
  publisher?: Publisher;
  formatter?: DigestFormatter;
  pinner?: FakePostPinner;
  dryRun?: boolean;
}): PostDailyDigestUseCase {
  return new PostDailyDigestUseCase({
    eventSource: options.eventSource ?? new FakeEventSource([TODAY_EVENT]),
    digestStore: options.digestStore ?? new FakeDigestStore(),
    formatter: options.formatter ?? new DailyDigestFormatter(TZ),
    publisher: options.publisher ?? new FakePublisher(),
    pinner: options.pinner,
    subreddit: 'BastropTX',
    timeZone: TZ,
    digestHour: 7,
    nowFn: () => options.now ?? MORNING,
    dryRun: options.dryRun,
  });
}

describe('PostDailyDigestUseCase', () => {
  it('is not due before the digest hour, and does not fetch', async () => {
    const eventSource = new FakeEventSource([TODAY_EVENT]);
    const result = await makeUseCase({ now: new Date('2026-11-22T12:30:00Z'), eventSource }).run();

    expect(result.status).toBe('not_due');
    expect(eventSource.calls).toHaveLength(0);
  });

  it('posts one digest for the local day, then reports already_posted', async () => {
    const digestStore = new FakeDigestStore();
    const publisher = new FakePublisher();
    const eventSource = new FakeEventSource([TODAY_EVENT]);

    const first = await makeUseCase({ digestStore, publisher, eventSource }).run();
    const second = await makeUseCase({
      digestStore,
      publisher,
      eventSource,
      now: new Date('2026-11-22T20:00:00Z'),
    }).run();

    expect(first).toMatchObject({ localDate: '2026-11-22', status: 'posted', eventCount: 1 });
    expect(second.status).toBe('already_posted');
    expect(publisher.textCalls).toHaveLength(1);
    expect(publisher.textCalls[0].subreddit).toBe('BastropTX');
    expect(digestStore.lastDate).toBe('2026-11-22');
  });

  it('queries from local midnight today to the end of tomorrow, not UTC days', async () => {
    const eventSource = new FakeEventSource([]);
    await makeUseCase({ eventSource }).run();

    expect(eventSource.calls[0].start.toISOString()).toBe('2026-11-22T06:00:00.000Z');
    expect(eventSource.calls[0].end.toISOString()).toBe('2026-11-24T06:00:00.000Z');
  });

  it('does not post when only tomorrow has events, but marks the day', async () => {
    const digestStore = new FakeDigestStore();
    const publisher = new FakePublisher();
    const tomorrowOnly = makeEvent('t', '2026-11-23T18:00:00Z', '2026-11-23T19:00:00Z');
    const result = await makeUseCase({ eventSource: new FakeEventSource([tomorrowOnly]), digestStore, publisher }).run();

    expect(result.status).toBe('no_events');
    expect(publisher.textCalls).toHaveLength(0);
    expect(digestStore.lastDate).toBe('2026-11-22');
  });

  it('posts a day with only ongoing events, counting them', async () => {
    const market = makeEvent('m', '2026-11-07T06:00:00Z', '2026-12-27T06:00:00Z');
    const result = await makeUseCase({ eventSource: new FakeEventSource([market]) }).run();

    expect(result).toMatchObject({ status: 'posted', eventCount: 1 });
  });

  it('includes tomorrow in the post without counting it', async () => {
    const publisher = new FakePublisher();
    const tomorrow = makeEvent('t', '2026-11-23T18:00:00Z', '2026-11-23T19:00:00Z');
    const result = await makeUseCase({ eventSource: new FakeEventSource([TODAY_EVENT, tomorrow]), publisher }).run();

    expect(result.eventCount).toBe(1);
    expect(publisher.textCalls[0].post.body).toContain('Event t');
  });

  it('marks an empty day handled without posting', async () => {
    const digestStore = new FakeDigestStore();
    const publisher = new FakePublisher();
    const result = await makeUseCase({ eventSource: new FakeEventSource([]), digestStore, publisher }).run();

    expect(result.status).toBe('no_events');
    expect(publisher.textCalls).toHaveLength(0);
    expect(digestStore.lastDate).toBe('2026-11-22');
  });

  it('in dry run, returns the post without publishing or marking the day', async () => {
    const digestStore = new FakeDigestStore();
    const publisher = new FakePublisher();
    const result = await makeUseCase({ digestStore, publisher, dryRun: true }).run();

    expect(result.status).toBe('dry_run');
    expect(result.wouldPost?.title).toContain('Sunday, November 22');
    expect(publisher.textCalls).toHaveLength(0);
    expect(digestStore.lastDate).toBeNull();
  });

  it('in dry run, does not mark an empty day either', async () => {
    const digestStore = new FakeDigestStore();
    await makeUseCase({ eventSource: new FakeEventSource([]), digestStore, dryRun: true }).run();

    expect(digestStore.lastDate).toBeNull();
  });

  it('leaves the day unmarked after a publish failure so the next run retries', async () => {
    const digestStore = new FakeDigestStore();
    const result = await makeUseCase({ digestStore, publisher: new FakePublisher(true) }).run();

    expect(result.status).toBe('publish_failed');
    expect(digestStore.lastDate).toBeNull();
  });

  it('posts again on the next local day', async () => {
    const digestStore = new FakeDigestStore('2026-11-21');
    const result = await makeUseCase({ digestStore }).run();

    expect(result.status).toBe('posted');
  });

  it('rethrows errors that are not publish failures', async () => {
    const failing: EventSource = {
      fetchEventsBetween: async () => {
        throw new Error('calendar down');
      },
    };
    await expect(makeUseCase({ eventSource: failing }).run()).rejects.toThrow('calendar down');
  });

  describe('pinning', () => {
    it('unpins the previous digest, pins the new one and remembers it', async () => {
      const digestStore = new FakeDigestStore(null, 't3_old');
      const pinner = new FakePostPinner();
      const result = await makeUseCase({ digestStore, pinner }).run();

      expect(pinner.calls).toEqual(['unpin:t3_old', 'pin:fake-submission-id']);
      expect(digestStore.pinnedId).toBe('fake-submission-id');
      expect(result).toMatchObject({ status: 'posted', pinned: true });
    });

    it('pins without unpinning when nothing was pinned before', async () => {
      const pinner = new FakePostPinner();
      await makeUseCase({ pinner }).run();

      expect(pinner.calls).toEqual(['pin:fake-submission-id']);
    });

    it('still pins when the old post cannot be unpinned (e.g. it was deleted)', async () => {
      const digestStore = new FakeDigestStore(null, 't3_gone');
      const pinner = new FakePostPinner('unpin');
      const result = await makeUseCase({ digestStore, pinner }).run();

      expect(pinner.calls).toEqual(['unpin:t3_gone', 'pin:fake-submission-id']);
      expect(result.pinned).toBe(true);
    });

    it('keeps the post and marks the day when pinning fails', async () => {
      const digestStore = new FakeDigestStore(null, 't3_old');
      const result = await makeUseCase({ digestStore, pinner: new FakePostPinner('pin') }).run();

      expect(result).toMatchObject({ status: 'posted', pinned: false });
      expect(digestStore.lastDate).toBe('2026-11-22');
      expect(digestStore.pinnedId).toBeNull();
    });

    it('reports nothing about pinning when no pinner is configured', async () => {
      const result = await makeUseCase({}).run();

      expect(result.pinned).toBeUndefined();
    });

    it('does not pin in dry run', async () => {
      const pinner = new FakePostPinner();
      await makeUseCase({ pinner, dryRun: true }).run();

      expect(pinner.calls).toEqual([]);
    });
  });
});
