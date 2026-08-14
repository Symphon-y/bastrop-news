# ytreddit-devvit

> The Devvit app is registered as **`bastrop-news`** (`name` in `devvit.json`), renamed
> at first upload because app names are globally unique. This directory keeps its
> original name. The test subreddit is r/bastrop_news_dev.

A Devvit app that watches a small set of YouTube channels and posts new videos to
r/BastropTX. Runs entirely on Reddit's infrastructure (no server/Pi to host) — a
rewrite of an earlier Python/PRAW prototype, moved to Devvit after Reddit's
non-commercial Data API access changed to require a manual approval ticket (see
project history for details).

## How it works

- A cron-style Devvit Scheduler task hits `/internal/scheduler/check-and-post`
  roughly every 15 minutes (the **check** cadence).
- Each configured channel (`src/server/channelsConfig.ts`) is checked via the
  official YouTube Data API v3. Channels with no `keywords` queue every upload;
  channels with `keywords` only queue videos whose title/description contain a
  matching keyword (case-insensitive) — used for regional news channels that
  aren't Bastrop-specific.
- New videos (within a configurable age window) are queued in Redis. At most one
  video is posted per run, and posts are spaced at least a configurable interval
  apart regardless of check frequency (the **post** cadence) — this is what
  prevents a backlog or a busy day from flooding the subreddit.
- Posts are submitted as plain link posts under the app's own account via
  `reddit.submitPost()`.

## Architecture

Same shape as the original Python design — SOLID ports/adapters, pure orchestration
logic unit-tested against fakes:

- `src/server/domain/video.ts` — `Video` type
- `src/server/application/ports.ts` — `VideoSource`, `VideoQueueStore`,
  `PostFormatter`, `Publisher`, `VideoFilter` interfaces
- `src/server/application/checkAndPost.ts` — `CheckAndPostUseCase`, the orchestration
- `src/server/infrastructure/` — concrete adapters:
  - `youtubeDataApiSource.ts` — YouTube Data API v3 (`channels.list` → uploads
    playlist → `playlistItems.list`)
  - `redisVideoQueueStore.ts` — `@devvit/redis`-backed queue/dedup/time-gate store
  - `redditPublisher.ts` — wraps `@devvit/reddit`'s `submitPost`
  - `videoFilters.ts`, `filteredVideoSource.ts` — keyword filtering, decorator pattern
  - `passthroughFormatter.ts` — v1 title/url formatter (the seam for a future
    AI-generated summary formatter, unchanged from the Python design's intent)
- `src/server/channelsConfig.ts` — the watched-channel list (not secret, checked in)
- `src/server/config.ts` — reads tuning knobs + the YouTube API key from Devvit settings
- `src/server/index.ts` — composition root / scheduler HTTP handler

## Local setup

```
npm install
npm test           # unit tests (Vitest) -- 37 passing
npm run typecheck  # tsc --noEmit
npm run build      # esbuild -> dist/server/index.cjs
```

Test coverage: every adapter and all orchestration logic is unit-tested against
hand-rolled fakes — no network, no Devvit runtime needed. Adapters that wrap a
Devvit singleton (`RedditPublisher`, `RedisVideoQueueStore`) take their client by
constructor injection and are tested against small in-memory fakes, rather than
Devvit's lower-level protobuf plugin mocks.

## Building

`devvit.json` declares `server.entry` as `dist/server/index.cjs`, and the schema
requires that file to be a self-contained **CommonJS** bundle. `npm run build`
produces it with esbuild (~3.9 MB, ~90 ms). `devvit.json`'s `scripts.build` and
`scripts.dev` point at `npm run build` / `npm run build:watch`, so `devvit upload`
and `devvit playtest` build it themselves — but `npm run build` before uploading
is harmless and rules out a whole class of confusion.

## Dry run

The `dryRun` global setting **defaults to on**. A dry run fetches, filters and
queues exactly as normal, then logs the post it *would* have submitted — without
publishing, without marking anything posted, and without advancing the post
time-gate. Anything queued during a dry run posts normally once it's turned off:

```
npx devvit settings set dryRun     # false to go live, true to stop posting
```

It doubles as the kill switch. Every run also logs one `queued <videoId>: <title>`
line per accepted video, which is how you see what the keyword filters are really
matching before it reaches the subreddit.

## Configuring watched channels

Edit `src/server/channelsConfig.ts` directly (checked into git, not a runtime
setting — there are only 3 channels and they change rarely):

```ts
export const CHANNEL_WATCHES: readonly ChannelWatch[] = [
  { channelId: 'UC...', keywords: [] },              // accept every upload
  { channelId: 'UC...', keywords: ['bastrop'] },     // only Bastrop-tagged stories
];
```

## Getting a YouTube Data API key

1. Create (or reuse) a Google Cloud project.
2. Enable "YouTube Data API v3" for that project.
3. Create an API key, restricted to the YouTube Data API v3.
4. Store it as a Devvit secret (never commit it): `npx devvit settings set youtubeApiKey`

Quota: each run costs ~2 units per channel (`channels.list` + `playlistItems.list`,
both cheap list endpoints — `search.list`, which costs 100 units/call, is
deliberately never used). At 3 channels × 96 runs/day that's ~576 units/day against
a 10,000/day free quota.

## Fetch Domains

Per Devvit's HTTP Fetch policy, this section documents every external domain the
app requests:

- `youtube.googleapis.com` — the official YouTube Data API v3, used to check
  watched channels for new uploads. Already on Devvit's global fetch allowlist,
  chosen specifically over the YouTube RSS feed (`www.youtube.com`, not globally
  allowed) to avoid a per-app domain-review wait.

## Deploying

```
npx devvit login
npx devvit settings set youtubeApiKey        # paste the real key when prompted
npx devvit playtest <your-test-subreddit>    # a <200-subscriber sub you moderate
```

During playtest, confirm: a real new video produces a real link post; a second
immediate run does *not* double-post (gate closed); a video outside the age window
is never queued.

Going live on r/BastropTX requires `devvit publish`, **not** `devvit upload`.
An uploaded-but-unpublished app can only be installed to a subreddit with fewer
than 200 subscribers, and r/BastropTX has ~5,500. `publish` files a review
request with your source attached:

```
npm run build
npx devvit publish                   # unlisted by default -- do NOT pass --public
# ...wait for review approval...
npx devvit install BastropTX
npx devvit list installs BastropTX   # confirm it's live
```

`publish` defaults to **unlisted**, so the app is reviewed but never listed in the
public App Directory — it just becomes installable past the 200-subscriber limit.
`npx devvit publish --withdraw` pulls a pending request back.

No systemd, no Raspberry Pi, no Docker involved for this app — Reddit hosts and
schedules it.

## Launch

The step-by-step path to going live — credentials, playtest, and deployment —
lives in [`docs/launch/`](./docs/launch/README.md). Work those phases in order.

## Open items / things to verify hands-on

These need an interactive Devvit login or mod access, so treat them as
first-playtest checks rather than settled facts:

- **Keyword filter blowout**: `KeywordFilter` matches descriptions as well as
  titles. If KXAN's or KVUE's standard description footer lists Bastrop as a
  coverage area, *every* upload from those high-volume channels matches. The
  public RSS feeds look clean, but RSS truncates descriptions — only the Data API
  shows the full text. There's a copy-paste check in
  [`docs/launch/phase-b-credentials.md`](./docs/launch/phase-b-credentials.md);
  run it before deploying.
- **App icon**: `devvit.json` has no `marketingAssets` block. The schema requires
  `marketingAssets.icon` (square 1024×1024 PNG, ≤500 KB) when that block is
  present, and a publish request is likely to want one. Not yet created.
- **Client-less app**: confirmed schema-legal (only `name` is required top-level),
  but not yet confirmed by a successful `playtest` run.
- **Domain review timing**: `youtube.googleapis.com` is on Devvit's global fetch
  allowlist, but every requested domain is still "submitted for review" on
  upload/playtest. Likely fast for a Google API, but budget for a short wait.
- **r/BastropTX AutoModerator**: check the automod config for link-post
  restrictions — a removed post still looks like success to this app.
