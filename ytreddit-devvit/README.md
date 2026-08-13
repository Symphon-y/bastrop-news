# ytreddit-devvit

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
npm test          # unit tests (Vitest)
npm run typecheck  # tsc --noEmit
```

Test coverage: all pure logic (`CheckAndPostUseCase`, filters, formatter, the
decorator, YouTube response parsing, `RedditPublisher`'s error translation) is
unit-tested with fakes/mocks — no network, no Devvit runtime needed. The one
exception is `RedisVideoQueueStore`: Devvit doesn't ship a lightweight in-memory
fake for `@devvit/redis` (only a lower-level plugin mock meant for their own test
harness), so this adapter is verified via `devvit playtest` instead of an
automated unit test.

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

```
npx devvit upload      # private/unlisted version -- no public app review needed
npx devvit install BastropTX
npx devvit list installs BastropTX   # confirm it's live
```

No systemd, no Raspberry Pi, no Docker involved for this app — Reddit hosts and
schedules it.

## Open items / things to verify hands-on

These couldn't be fully verified without completing Devvit's interactive
browser-based login, so treat them as first-playtest checks rather than settled
facts:

- **Build/bundle step**: `devvit.json`'s `server.dir`/`server.entry`
  (`dist/server/index.js`) describe where Devvit's schema expects a server
  bundle. It's *expected* that `devvit playtest`/`devvit upload` builds and
  bundles `src/server/index.ts` automatically (their CLI ships its own esbuild
  dependency), but this repo doesn't include a manual bundling step — if the
  first `playtest` can't find/build the entrypoint, that's the first thing to
  check.
- **Client-less app**: confirmed via Devvit's own `devvit.json` schema that only
  `name` is a required top-level field (no `post`/`blocks` client config
  required), so omitting `src/client/` entirely should be valid — but this
  hasn't been confirmed by an actual successful `playtest` run yet.
- **Domain review timing**: `youtube.googleapis.com` is on Devvit's global fetch
  allowlist, but the docs state every requested domain is still "submitted for
  review" on upload/playtest. Likely fast for a well-known Google API domain,
  but budget for a short wait on the first `playtest` just in case.
- **r/BastropTX AutoModerator**: check the subreddit's automod config for
  link-post restrictions before relying on the scheduler for real — a removed
  post still looks like success to this app.
