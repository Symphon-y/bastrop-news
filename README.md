# bastrop-news

A Reddit app that watches a small, fixed list of YouTube channels and posts new videos
to the subreddit it is installed in. It was built for **r/BastropTX**, where the local
government channel publishes city council and commission recordings that residents
otherwise have to go looking for.

It runs entirely on Reddit's infrastructure. There is no server to host.

## What it does

Every 15 minutes the app checks each watched channel for new uploads:

- The **main channel** (Bastrop TX Network) contributes every upload.
- **Regional news channels** (KVUE, KXAN) are keyword-filtered. Their videos are only
  considered if the title or description mentions Bastrop, because those stations cover
  the whole Austin area and most of their output is not local to Bastrop.

Anything new and recent enough is added to a queue. Then, at most once per hour, the
app takes the oldest queued video and submits it as a plain link post — the video's
title, linking to the video.

Three rules keep it quiet, and they matter more than the checking:

- **At most one post per run**, so a burst of uploads can never become a burst of posts.
- **A minimum gap between posts** (default one hour) enforced independently of how often
  the app checks. Checking is cheap; posting is separately rate-limited.
- **An age window** (default 48 hours). Videos older than that are never queued, so
  installing the app does not flood the subreddit with a channel's back catalogue.

Posts are made by the app's own account. The app never posts on behalf of a redditor.

## Who it is for

Moderators of a local subreddit who want a specific set of YouTube channels surfaced
automatically, without a volunteer having to check for new videos by hand.

## Operational notes

**The kill switch is the `dryRun` setting.** While it is on — and it is on by default —
the app still checks channels, filters, and queues videos, but instead of posting it
logs the post it *would* have made. Nothing reaches the subreddit. Turn it on at any
time to stop the app posting without uninstalling it.

**`dryRun` is a string setting, not a boolean, and this is deliberate.** `devvit
settings set` transmits every value as a string, and the string `"false"` is truthy in
JavaScript, so a setting declared as a boolean cannot be switched off from the command
line — it silently stays on. Declaring it as a string and interpreting the value means
`"off"` and `"false"` do what they say. Anything unrecognised is treated as *on*, so an
unclear value fails safe.

```
npx devvit settings set dryRun     # "off" to post for real, "on" to stop
```

**Every run logs what it accepted.** Each accepted video is logged as
`queued <videoId>: <title>`, and every run logs the subreddit it resolved. If a keyword
filter starts matching too broadly, it shows up in the logs before it shows up in the
subreddit.

**Watch the post volume for the first day.** The main channel publishes a few times a
month and the news channels rarely match, so more than a couple of posts a day means a
filter is too broad. Set `dryRun` back on if that happens.

## Configuration

All settings are optional except the YouTube API key.

| Setting | Default | Purpose |
| --- | --- | --- |
| `youtubeApiKey` | — | Google Cloud API key with YouTube Data API v3 enabled. Required. |
| `dryRun` | `on` | `off` to post for real. The kill switch. |
| `minSecondsBetweenPosts` | `3600` | Minimum gap between posts. |
| `maxVideoAgeHours` | `48` | Videos older than this are never queued. |

There is no setting for which subreddit to post to. The app posts to the subreddit it is
installed in, so it cannot post anywhere else.

### Watched channels

Channels are defined in `src/server/channelsConfig.ts` rather than in settings, since
they change rarely:

```ts
export const CHANNEL_WATCHES: readonly ChannelWatch[] = [
  { channelId: 'UC...', keywords: [] },          // every upload
  { channelId: 'UC...', keywords: ['bastrop'] }, // only keyword matches
];
```

An empty `keywords` array accepts every upload. A non-empty one accepts a video only if
its title or description contains one of the keywords, case-insensitively. Resolve a
`@handle` to a channel ID with the YouTube Data API's `channels.list(forHandle=...)`.

`npm run check:filters` reports what the current configuration would queue right now,
running the app's own fetching and filtering against live data. It labels each match as
`TITLE` or `DESCRIPTION-ONLY`, which is how you catch a channel whose boilerplate
description footer matches a keyword on every single upload.

## Getting a YouTube Data API key

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Create an API key and restrict it to that API.
4. Leave *Application restrictions* set to **None** — requests originate from Reddit's
   servers, so there is no stable IP or referrer to restrict to.
5. Store it as a Devvit secret: `npx devvit settings set youtubeApiKey`.

No billing account is required.

**Quota.** Each run costs about 2 units per channel — `channels.list` plus
`playlistItems.list`, both cheap. `search.list`, which costs 100 units per call, is
deliberately never used. Three channels checked every 15 minutes is roughly 576 units
per day against a 10,000/day free quota. Checking every minute instead would cost about
8,640, so the 15-minute schedule is what keeps this comfortable.

## Fetch Domains

The following domains are requested for this app:

- `youtube.googleapis.com` — the official YouTube Data API v3, used to list recent
  uploads for the configured channels. This is the app's only external request. It was
  chosen over YouTube's RSS feeds, which are served from `www.youtube.com`, to keep the
  request surface to a single documented API endpoint.

## Notes for app review

- **Posts are attributed to the app account** (`runAs: 'APP'` in
  `src/server/infrastructure/redditPublisher.ts`). The app does not take actions on
  behalf of any redditor, and requests no such permission.
- **The app reads no Reddit user data.** It reads public YouTube metadata and writes
  link posts. It does not read profiles, comments, votes, or messages.
- **YouTube brand usage** is limited to linking to YouTube videos and naming YouTube as
  the source, as permitted by the YouTube Branding Guidelines. The app's name contains
  neither "YouTube" nor "YT".
- **Stored data expires after 30 days**, matching YouTube's Developer Policies cap on
  retaining non-authorized API data.
- **Posting is rate-limited in the app itself**, independently of the check schedule —
  see the three rules above.

Policies: [Privacy Policy](docs/privacy.md) · [Terms and Conditions](docs/terms.md)

## Architecture

Ports and adapters. All orchestration logic is unit-tested against in-memory fakes, with
no network and no Devvit runtime required.

```
src/server/
├── domain/video.ts              Video -- the one domain type
├── application/
│   ├── ports.ts                 VideoSource, VideoQueueStore, PostFormatter,
│   │                            Publisher, VideoFilter
│   └── checkAndPost.ts          CheckAndPostUseCase -- the only orchestration
├── infrastructure/
│   ├── youtubeDataApiSource.ts  YouTube Data API v3
│   ├── redisVideoQueueStore.ts  Redis-backed queue, dedup, and time gate
│   ├── redditPublisher.ts       wraps submitPost
│   ├── videoFilters.ts          AcceptAllFilter, KeywordFilter
│   ├── filteredVideoSource.ts   VideoSource + VideoFilter -> VideoSource
│   └── passthroughFormatter.ts  title and url, truncated to Reddit's limit
├── channelsConfig.ts            watched channels (checked in, not secret)
├── config.ts                    settings and the target subreddit
└── index.ts                     composition root and scheduler endpoint
```

`CheckAndPostUseCase.run()` does two things per tick:

1. **Ingest** — fetch every configured source (each already filtered) and enqueue
   anything new and inside the age window. Enqueueing is idempotent, so re-seeing a
   video is free.
2. **Post, time-gated** — if enough time has passed since the last post, take the oldest
   pending video and publish it. Otherwise do nothing.

## Development

```
npm install
npm test           # 48 unit tests
npm run typecheck
npm run build      # esbuild -> dist/server/index.cjs
```

`devvit.json` declares `server.entry` as a self-contained CommonJS bundle, which
`npm run build` produces. `scripts.build` and `scripts.dev` in `devvit.json` point at
those npm scripts, so `devvit upload` and `devvit playtest` build it themselves.

### Deploying

Run every `devvit` command from the repository root.

```
npx devvit login
npm run build
npx devvit upload
npx devvit settings set youtubeApiKey
npx devvit playtest <a test subreddit you moderate>
```

An uploaded but unpublished app is visible only to its owner and installable only to
subreddits with fewer than 200 subscribers. Installing anywhere larger requires
`npx devvit publish`, which files a review request. `publish` defaults to unlisted, so
the app is reviewed without being listed in the public App Directory.

```
npx devvit publish                   # unlisted; --public is not wanted here
npx devvit install <subreddit>
```

Publishing requires a Privacy Policy URL and a Terms URL saved on the app's
developer-settings page, because the app uses HTTP fetch.
