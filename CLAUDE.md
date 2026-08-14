# Bots

A workspace for small personal bot projects. Currently contains one project:

## ytreddit-devvit/

A [Devvit](https://developers.reddit.com/docs) app that watches a small set of YouTube
channels and posts new videos to **r/BastropTX**. It runs entirely on Reddit's own
infrastructure — no server, no Raspberry Pi, no Docker for this project.

The Devvit app is registered as **`bastrop-news`** (`name` in `devvit.json` and
`package.json`), renamed at first upload because Devvit app names are globally unique.
The directory keeps its original `ytreddit-devvit/` name. The playtest subreddit is
**r/bastrop_news_dev**; the production target is r/BastropTX.

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

A `dryRun` setting (**default on**) makes step 2 report the post it would have submitted
instead of publishing it — no publish, no `markPosted`, no gate advance. Ingest still
happens, so anything queued during a dry run posts normally once it's switched off.
It's also the kill switch. Every run returns `queuedThisRun` (each accepted video's id
and title), which `index.ts` logs line by line — that's how an over-broad keyword filter
gets caught before it floods the subreddit.

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
- `RedisVideoQueueStore` — same approach: it takes a `RedisClientLike` by constructor
  injection and is tested against `tests/fakes/fakeRedis.ts`, an in-memory fake that
  mirrors the two contract details the adapter depends on (`get()` resolves to
  `undefined`, not `null`, for a missing key; `zRange` returns score-sorted
  `{member, score}` objects). Devvit's own `RedisMock` is a low-level protobuf-plugin
  mock needing an `ioredis` connection behind it — not worth it for a 4-method adapter.

`npm run typecheck` — `tsc --noEmit`. `npm run build` — esbuild bundles
`src/server/index.ts` into `dist/server/index.cjs`, the self-contained CommonJS file
`devvit.json`'s `server.entry` points at; `devvit.json`'s `scripts.build`/`scripts.dev`
hooks invoke it from `devvit upload`/`playtest`. `devvit.json` is validated against
Reddit's published JSON Schema (`@devvit/shared-types/schemas/config-file.v1.json`)
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
npx devvit publish                           # unlisted by default -- do NOT pass --public
# ...wait for review approval...
npx devvit install BastropTX
```

`devvit upload` is **not** sufficient for r/BastropTX: an unpublished app installs only
to subreddits under 200 subscribers, and r/BastropTX has ~5,500. `publish` files a
review request with the source attached; it defaults to unlisted, so the app is
reviewed but never listed in the public App Directory.

Full details, quota math, and the "Fetch Domains" disclosure are in
`ytreddit-devvit/README.md`.

### Launching

The ordered launch plan lives in `ytreddit-devvit/docs/launch/` — Phase A (build step,
dry run, CLI pinning) is done; B (credentials), C (playtest), D (go-live) are checklists
to work through as the Reddit/Google logins happen.

### Open items (not yet verified hands-on)

- **Keyword filter blowout risk**: `KeywordFilter` matches descriptions as well as
  titles, and KVUE/KXAN upload many videos a day. If their boilerplate description
  footer names Bastrop, every upload matches. RSS descriptions look clean but are
  truncated; the Data API check in `docs/launch/phase-b-credentials.md` settles it.
- **App icon**: no `marketingAssets` block in `devvit.json` yet; the schema requires a
  square 1024×1024 PNG (≤500 KB) when present, and a publish request likely wants one.
- Whether a client-less app (no `src/client/`, no post type) installs cleanly —
  schema-legal, not yet confirmed by a real `playtest`.
- Whether the `youtube.googleapis.com` fetch-domain request clears review quickly.
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
