# bastrop-news

A Reddit app that watches a small, fixed list of YouTube channels and posts new videos
to the subreddit it is installed in. It was built for **r/BastropTX**, where the local
government channel publishes city council and commission recordings that residents
otherwise have to go looking for. It can also post a daily digest of local events from
[bastropcountycalendar.com](https://bastropcountycalendar.com).

It runs entirely on Reddit's infrastructure. There is no server to host.

## What it does

Every 15 minutes the app checks each watched channel for new uploads:

- The **main channel** (Bastrop TX Network) contributes every upload.
- **Regional news channels** (KVUE, KXAN) are keyword-filtered. Their videos are only
  considered if the title or description mentions Bastrop, because those stations cover
  the whole Austin area and most of their output is not local to Bastrop.
- **Vertical uploads from the news channels are dropped.** Both stations reformat a
  story into a horizontal video and a vertical Short and publish them within the hour,
  and both copies match the keywords, so the subreddit used to get the story twice. The
  two are titled differently enough that comparing titles does not reliably pair them,
  so the app compares the shape of the video instead. The trade-off is deliberate: a
  story a station publishes *only* as a Short is not posted. This does not apply to the
  main channel, where a vertical upload is the story rather than a reformat of one.

Anything new and recent enough is added to a queue. Then, at most once per hour, the
app takes the oldest queued video and submits it as a plain link post — the video's
title, linking to the video.

Three rules keep it quiet, and they matter more than the checking:

- **At most one post per run**, so a burst of uploads can never become a burst of posts.
- **A minimum gap between posts** (default one hour) enforced independently of how often
  the app checks. Checking is cheap; posting is separately rate-limited.
- **An age window** (default 48 hours). Videos older than that are never queued, so
  installing the app does not flood the subreddit with a channel's back catalogue.

### Daily events digest

When the `eventsDigest` setting is on, the app also posts **one text post each morning**
titled *Happening today in Bastrop County: Sunday, November 22*. Each event has its
time, venue, and a link to its page. The post has three sections:

- **Today:** all-day events first, then timed ones in order.
- **Ongoing:** multi-day events that started earlier, one line each with their last day
  (`through Sat, Dec 26`), so a long-running listing does not crowd out the day's own
  events.
- **Tomorrow:** a preview of events starting the next day.

It ends with links to the source site's own Today, This weekend and This week pages, and
to the public calendar.

- **The events come from a public Google Calendar.** A separate Google Apps Script
  (`apps-script/`) fills that calendar each morning at 5 AM from
  bastropcountycalendar.com's listings, used with the site owner's permission. Residents
  can subscribe to the same calendar.
- **At most one digest per day.** The app checks hourly. It posts on the first check at
  or after `eventsDigestHour` (7 AM Central by default), and remembers the date it
  posted so it never posts twice in a day. A failed post is retried the next hour.
- **No events, no post.** When nothing is listed for today (tomorrow alone does not
  count), the app posts nothing.
- **Optional sticky.** With `stickyDigest` on, each digest is pinned and the previous
  one unpinned, so the subreddit always shows the current day. It is off by default.
- **Moderators can remove a listing** by deleting it from the Google Calendar. The sync
  then leaves it out for good, so it never appears in a digest.

The digest replaces what would otherwise be about ten individual event posts a day.

Posts are made by the app's own account. The app never posts on behalf of a redditor.

## Who it is for

Moderators of a local subreddit who want a specific set of YouTube channels surfaced
automatically, without a volunteer having to check for new videos by hand.

## Operational notes

**The kill switch is the `dryRun` setting.** While it is on — and it is on by default —
the app still checks channels, filters, and queues videos, but instead of posting it
logs the post it *would* have made. Nothing reaches the subreddit. Turn it on at any
time to stop the app posting without uninstalling it. It covers the events digest too:
in a dry run the full digest text is logged instead of posted.

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

**Every orientation check is logged too**, as
`aspect-ratio: <n> checked, <n> known, <n> vertical`. A run that reports zero known
ratios means the lookup is failing and nothing is being filtered — the app keeps posting
rather than stopping, because a video whose orientation cannot be determined is treated
as horizontal.

**If the vertical filter drops something it should not**, set `excludeVerticalVideos` to
`off`. Nothing is lost permanently: the video is fetched and queued again on the next
run, as long as it is still inside the age window and still among the channel's 15 most
recent uploads.

## Configuration

All settings are optional except the YouTube API key, and the Calendar API key when
the events digest is on.

| Setting | Default | Purpose |
| --- | --- | --- |
| `youtubeApiKey` | — | Google Cloud API key with YouTube Data API v3 enabled. Required. |
| `dryRun` | `on` | `off` to post for real. The kill switch, for videos and the digest. |
| `minSecondsBetweenPosts` | `3600` | Minimum gap between video posts. |
| `maxVideoAgeHours` | `48` | Videos older than this are never queued. |
| `excludeVerticalVideos` | `on` | `off` to keep vertical videos. Drops the duplicate Shorts the news channels post alongside each story. |
| `eventsDigest` | `off` | `on` to post the daily events digest. |
| `googleCalendarApiKey` | — | Google Cloud API key with the Google Calendar API enabled. Required when `eventsDigest` is on. May be the same key as `youtubeApiKey`. |
| `eventsDigestHour` | `7` | Local (Central) hour, 0–23, from which the day's digest is posted. |
| `stickyDigest` | `off` | `on` to pin each day's digest in place of the previous one. Takes a free sticky slot, or replaces the bottom sticky when both are in use. |

`eventsDigest` and `stickyDigest` are strings for the same reason as `dryRun`.

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

### Events calendar

The calendar the digest reads is set by `EVENTS_CALENDAR_ID` in
`src/server/eventsConfig.ts`. Like the channel list, it is checked in, not a setting. The
digest refuses to run while it is empty. Creating and filling the calendar is covered in
[`apps-script/README.md`](apps-script/README.md).

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

For the events digest, also enable the **Google Calendar API** in the same project. Add
it to the key's API restrictions, or create a second key restricted to it. Then run
`npx devvit settings set googleCalendarApiKey`. The digest normally makes one Calendar
API call a day; checks before it is due make none. A dry run never marks the day done,
so it reads the calendar on every hourly check after the digest hour. That is still a
negligible amount of quota.

**Quota.** Each run costs about 2 units per channel — `channels.list` plus
`playlistItems.list`, both cheap. `search.list`, which costs 100 units per call, is
deliberately never used. Three channels checked every 15 minutes is roughly 576 units
per day against a 10,000/day free quota. Checking every minute instead would cost about
8,640, so the 15-minute schedule is what keeps this comfortable.

Checking orientation adds at most one unit per news channel per run — a single
`videos.list` call covering every candidate at once, made only when that channel has a
video that already passed the keyword filter. Most runs have none and skip the call
entirely, so the realistic ceiling is under 770 units per day.

## Fetch Domains

The following domains are requested for this app:

- `youtube.googleapis.com` — the official YouTube Data API v3. The app uses it to list
  recent uploads for the configured channels (`channels.list`, `playlistItems.list`) and
  to read the player dimensions of a candidate video, which is how it tells a vertical
  Short from the horizontal original (`videos.list`). It was chosen over YouTube's
  RSS feeds, which are served from `www.youtube.com`, so that every YouTube request goes
  to one documented API.
- `www.googleapis.com` — the official Google Calendar API v3, used read-only to list
  today's and tomorrow's events on one public calendar for the daily events digest. Only
  `GET /calendar/v3/calendars/{calendarId}/events` is called, with an API key. It is
  normally called once a day, or hourly while `dryRun` is on. No OAuth and no user data
  are involved. It is used only when a moderator turns the digest on.

## Notes for app review

- **Posts are attributed to the app account** (`runAs: 'APP'` in
  `src/server/infrastructure/redditPublisher.ts`). The app does not take actions on
  behalf of any redditor, and requests no such permission.
- **The `moderator` Reddit scope is used only to sticky the digest.** Pinning today's
  digest and unpinning yesterday's (`pin`/`unpin` in `redditPublisher.ts`) are moderator
  actions. They run only when a moderator sets `stickyDigest` to `on`, and only on the
  app's own digest posts.
- **The app reads no Reddit user data.** It reads public YouTube metadata and, when the
  digest is on, public calendar events. It writes link posts and at most one daily text
  post. It does not read profiles, comments, votes, or messages.
- **`apps-script/` is not part of the Reddit app.** It is a separate Google Apps Script
  that runs under the calendar owner's Google account, on Google's infrastructure, and
  fills the public calendar the digest reads. It is not in the Devvit bundle and makes
  no requests from Reddit. It is included so the source of the calendar data can be
  reviewed.
- **YouTube brand usage** is limited to linking to YouTube videos and naming YouTube as
  the source, as permitted by the YouTube Branding Guidelines. The app's name contains
  neither "YouTube" nor "YT".
- **Stored data expires after 30 days**, matching YouTube's Developer Policies cap on
  retaining non-authorized API data. The events digest stores no event data at all,
  only the date of the last digest it posted and, when sticky is on, that post's id.
- **Event listings are used with permission** from bastropcountycalendar.com's owner,
  and each event in a digest links back to its page there.
- **Posting is rate-limited in the app itself**, independently of the check schedule —
  see the three rules above.

Policies: [Privacy Policy](https://github.com/Symphon-y/bastrop-news/blob/main/docs/privacy.md) ·
[Terms and Conditions](https://github.com/Symphon-y/bastrop-news/blob/main/docs/terms.md)

These are the same URLs saved as the app's Privacy Policy and Terms URLs on its
developer-settings page, so `docs/privacy.md` and `docs/terms.md` are the live source of
both — there is no separate hosted copy to keep in sync.

## Architecture

Ports and adapters. All orchestration logic is unit-tested against in-memory fakes, with
no network and no Devvit runtime required.

```
src/server/
├── domain/
│   ├── video.ts                 Video
│   └── calendarEvent.ts         CalendarEvent
├── application/
│   ├── ports.ts                 VideoSource, VideoQueueStore, PostFormatter,
│   │                            Publisher, VideoFilter
│   ├── checkAndPost.ts          CheckAndPostUseCase -- video ingest and posting
│   ├── postDailyDigest.ts       PostDailyDigestUseCase -- one events digest a day
│   ├── digestSchedule.ts        sorts events into today, ongoing and tomorrow
│   └── localDay.ts              local-day bounds in a time zone, DST-safe
├── infrastructure/
│   ├── youtubeDataApiSource.ts  YouTube Data API v3
│   ├── aspectRatioVideoSource.ts  adds player aspect ratios (videos.list)
│   ├── redisVideoQueueStore.ts  Redis-backed queue, dedup, and time gate
│   ├── googleCalendarEventSource.ts  Google Calendar API v3, public calendar
│   ├── dailyDigestFormatter.ts  digest title and markdown body
│   ├── redisDigestStore.ts      date and pinned post id of the last digest
│   ├── redditPublisher.ts       submitPost (link and text posts), sticky/unsticky
│   ├── videoFilters.ts          AcceptAllFilter, KeywordFilter, LandscapeOnlyFilter
│   ├── filteredVideoSource.ts   VideoSource + VideoFilter -> VideoSource
│   └── passthroughFormatter.ts  title and url, truncated to Reddit's limit
├── channelsConfig.ts            watched channels (checked in, not secret)
├── eventsConfig.ts              events calendar id, time zone, source-site links
├── config.ts                    settings and the target subreddit
└── index.ts                     composition root and scheduler endpoints

apps-script/                     Google Apps Script: site events -> public calendar
├── Labels.js                    categories and label matching
├── Parse.js                     source record normalisation
└── Sync.js                      daily sync and Calendar API calls
```

`CheckAndPostUseCase.run()` does two things per tick:

1. **Ingest** — fetch every configured source (each already filtered) and enqueue
   anything new and inside the age window. Enqueueing is idempotent, so re-seeing a
   video is free.
2. **Post, time-gated** — if enough time has passed since the last post, take the oldest
   pending video and publish it. Otherwise do nothing.

`PostDailyDigestUseCase.run()` is called hourly and is independent of the video flow. It
works out the local date and hour in `America/Chicago`. If the digest is due and has not
been posted today, it reads today's and tomorrow's events (local midnight to midnight,
so DST days are 23 or 25 hours). `buildDailyDigest` sorts them into today, ongoing and
tomorrow, each event in one section only, and the formatter renders them as one text
post. With a pinner configured, the new post then replaces the previous digest as a
sticky; a pin failure is logged and never undoes or repeats the post.

## Development

```
npm install
npm test           # 160 unit tests
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
npx devvit upload                                   # prints the new version
npx devvit install <test subreddit> bastrop-news@<version>
npx devvit settings set youtubeApiKey
npx devvit settings set googleCalendarApiKey        # events digest only
npx devvit settings set eventsDigest                # "on" to enable it
npx devvit settings set stickyDigest                # optional: "on" to pin each digest
```

`devvit upload` updates no install, and `devvit settings set` only accepts keys declared
by a version that is actually installed somewhere. A newly added setting therefore
cannot be set until the version that declares it is installed. `npx devvit playtest
<subreddit>` is the alternative to installing while iterating.

The Apps Script that fills the events calendar deploys separately, with
[clasp](https://github.com/google/clasp), from the repository root:

```
npx @google/clasp login
npx @google/clasp push --force       # .clasp.json points at the script project
```

Setup, scheduling, and the calendar itself are covered in
[`apps-script/README.md`](apps-script/README.md).

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
