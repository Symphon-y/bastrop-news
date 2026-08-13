# Bots

A workspace for small personal bot projects. Currently contains one project:

## ytreddit-devvit/

A [Devvit](https://developers.reddit.com/docs) app that watches a small set of YouTube
channels and posts new videos to **r/BastropTX**. It runs entirely on Reddit's own
infrastructure — no server, no Raspberry Pi, no Docker for this project.

### What it does

- Every ~15 minutes, a Devvit Scheduler cron job checks the [YouTube Data API v3](https://developers.google.com/youtube/v3)
  for new uploads on a fixed list of channels (`src/server/channelsConfig.ts`).
- The **main channel** (Bastrop TX Network) posts every upload. **Regional news channels**
  (KVUE, KXAN) are keyword-filtered — a video only queues if its title/description contains
  a match (currently `"bastrop"`, case-insensitive).
- New videos (within a configurable age window, default 48h) are queued in Redis. This
  prevents a fresh install from flooding the subreddit with the channels' back-catalogs.
- At most **one video posts per run**, and posts are spaced at least a configurable minimum
  interval apart (default 1 hour) — independent of how often the scheduler checks. This is
  the anti-spam design: checking frequently is cheap and safe; posting frequently is
  separately rate-limited.
- Posts are submitted as plain link posts (title + URL), not interactive Devvit posts.

### Architecture

Ports-and-adapters / clean architecture, same shape end-to-end:

```
src/server/
├── domain/video.ts              Video — the one domain type
├── application/
│   ├── ports.ts                 VideoSource, VideoQueueStore, PostFormatter,
│   │                            Publisher, VideoFilter — all interfaces
│   └── checkAndPost.ts          CheckAndPostUseCase — the only orchestration logic
├── infrastructure/
│   ├── youtubeDataApiSource.ts  YouTube Data API v3 adapter
│   ├── redisVideoQueueStore.ts  @devvit/redis-backed queue/dedup/time-gate store
│   ├── redditPublisher.ts       wraps @devvit/reddit's submitPost
│   ├── videoFilters.ts          AcceptAllFilter, KeywordFilter
│   ├── filteredVideoSource.ts   decorator: VideoSource + VideoFilter → VideoSource
│   └── passthroughFormatter.ts  v1 formatter (title/url passthrough + truncation)
├── channelsConfig.ts            watched channels + keywords (not secret, checked in)
├── config.ts                    reads tuning knobs + API key from Devvit settings
└── index.ts                     composition root / scheduler HTTP handler
```

`CheckAndPostUseCase.run()` does two phases every tick:
1. **Ingest** — fetch all configured channel sources (each already filtered), enqueue
   anything new and within the age window (`enqueueIfNew` is idempotent).
2. **Post (time-gated)** — if enough time has passed since the last post, pop the oldest
   pending video and publish it. Otherwise do nothing this tick.

This design and the four ports were carried over unchanged from an earlier Python/PRAW
prototype for the same bot (see "Project history" below) — re-platformed to TypeScript,
not redesigned.

### Testing

`npm test` (Vitest) — all pure logic is unit-tested against hand-rolled fakes, no network
or Devvit runtime required:

- `CheckAndPostUseCase` — 8 scenarios (queueing, age-window exclusion, dedup, gate
  open/closed, FIFO drain across runs, empty feed, multi-source aggregation, publish
  failure doesn't corrupt state)
- `KeywordFilter` / `AcceptAllFilter`, `FilteredVideoSource`, `PassthroughFormatter`
- `YoutubeDataApiSource` — pure response parsing + fetch orchestration (mocked `fetch`)
- `RedditPublisher` — constructor-injected against a fake `{submitPost}` object (no need
  for Devvit's heavier plugin-mock test harness)

**Known gap**: `RedisVideoQueueStore` has no automated test. Devvit ships a `RedisMock`
(`@devvit/redis/test/mocks/RedisMock`) but it's a low-level protobuf-plugin mock requiring
a real or `ioredis-mock`-backed `ioredis` connection to back it — wiring that was judged
not worth it for a 3-method adapter on a hobby project. This adapter is verified via
`devvit playtest` instead.

`npm run typecheck` — `tsc --noEmit`. `devvit.json` has also been validated directly
against Reddit's published JSON Schema (`@devvit/shared-types/schemas/config-file.v1.json`)
rather than hand-checked against docs prose.

### Configuring channels

Edit `src/server/channelsConfig.ts` directly — checked into git, not a runtime setting,
since there are only 3 channels and they change rarely:

```ts
export const CHANNEL_WATCHES: readonly ChannelWatch[] = [
  { channelId: 'UC...', keywords: [] },          // every upload
  { channelId: 'UC...', keywords: ['bastrop'] }, // only keyword matches
];
```

Resolve a `@handle` to a channel ID via the YouTube Data API's `channels.list(forHandle=...)`
(no scraping script needed, unlike the old Python version).

### Deploying

```
npx devvit login
npx devvit settings set youtubeApiKey        # Google Cloud API key w/ YouTube Data API v3 enabled
npx devvit playtest <test-subreddit>         # a <200-subscriber sub you moderate
npx devvit upload                            # private/unlisted, no public app review needed
npx devvit install BastropTX
```

Full details, quota math, and the "Fetch Domains" disclosure are in
`ytreddit-devvit/README.md`.

### Open items (not yet verified hands-on)

These need an actual `devvit playtest` run to confirm — see `ytreddit-devvit/README.md`
"Open items" for the full list:
- Whether Devvit's CLI auto-builds/bundles `src/server/index.ts`, or whether a manual
  bundle step is needed to satisfy `devvit.json`'s `server.dir`/`server.entry`.
- Whether a client-less app (no `src/client/`, no post type) actually installs cleanly —
  confirmed valid against the JSON Schema (only `name` is required top-level), but not
  yet confirmed via a real `playtest`.
- Whether the `youtube.googleapis.com` fetch-domain request clears review quickly, given
  it's already on Devvit's global allowlist.
- r/BastropTX's AutoModerator config hasn't been checked for link-post restrictions.

### Project history

This bot was originally built as a Python/PRAW project (SQLite queue, systemd timer on a
home Raspberry Pi). Mid-setup, Reddit's non-commercial Data API access turned out to now
require a manual "Data Access Request" approval ticket rather than simple self-serve app
creation — and that ticket form explicitly nudges applicants toward Devvit. Since the
Python bot's logic (queue/time-gate rules, keyword filtering, formatter) was already
validated by its test suite, the rewrite ported that design 1:1 to Devvit rather than
redesigning from scratch. The Python implementation was fully removed once the Devvit
rewrite was approved — there's no parallel implementation to maintain.

## Adding another bot to this workspace

If a second bot project gets added here later, give it its own subdirectory (like
`ytreddit-devvit/`) and its own `README.md`; add a section to this file the same way the
`ytreddit-devvit/` section above is structured.
