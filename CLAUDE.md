# bastrop-news

A [Devvit](https://developers.reddit.com/docs) app that watches a fixed list of YouTube
channels and posts new videos to the subreddit it is installed in, and optionally posts a
daily digest of local events read from a public Google Calendar. Built for
**r/BastropTX**; playtested against **r/bastrop_test**. It runs on Reddit's
infrastructure — there is no server, container, or host machine involved.

The Devvit app name is `bastrop-news` (`name` in `devvit.json` and `package.json`).

See `README.md` for what the app does, its settings, quota math, and deployment. This
file covers what is worth knowing before changing the code.

## Architecture

Ports and adapters:

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
│   ├── digestSchedule.ts        buildDailyDigest -- today / ongoing / tomorrow
│   └── localDay.ts              local-day bounds in a time zone, DST-safe
├── infrastructure/              one adapter per port
├── channelsConfig.ts            watched channels (checked in, not secret)
├── eventsConfig.ts              events calendar id and time zone (checked in)
├── config.ts                    settings, coercion, target subreddit
└── index.ts                     composition root / scheduler endpoint
```

`CheckAndPostUseCase.run()` ingests (fetch every filtered source, enqueue anything new
inside the age window) then posts under a time gate (if enough time has passed, publish
the oldest pending video). `dryRun` suppresses publishing, marking posted, and advancing
the gate, while leaving ingest intact.

`PostDailyDigestUseCase.run()` runs from an hourly cron but posts at most once per local
(`America/Chicago`) day. Being due is decided in code, not by the cron, so the post
stays at the same local hour across DST and a failure retries an hour later. It fetches
today and tomorrow in one call; `buildDailyDigest` (pure) decides which section each
event belongs to, and `DailyDigestFormatter` only renders. Pinning is a separate
`PostPinner` port, optional, and runs after the day is marked so a pin failure can
never cause a second post.
`apps-script/` is a separate Google Apps Script that fills the calendar from two
sources: bastropcountycalendar.com (an aggregator of 25+ calendars) and the City of
Bastrop's Community Calendar, which the aggregator does not carry. It is never uploaded
to Reddit; see its README.

## Testing

`npm test` — 227 Vitest tests, no network and no Devvit runtime. Adapters that wrap a
Devvit singleton (`RedditPublisher`, `RedisVideoQueueStore`) take their client by
constructor injection and are tested against in-memory fakes in `tests/fakes/`.
`apps-script/*.js` are plain Apps Script (global declarations, no modules).
`tests/fakes/appsScriptSandbox.ts` evaluates them in a `node:vm` sandbox with a stub
`Utilities`; `appsScriptSync.test.ts` runs `syncEvents()` end to end against in-memory
Calendar, source and properties fakes.

`npm run typecheck`, `npm run build` (esbuild → `dist/server/index.cjs`). `devvit.json`
can be validated against `node_modules/@devvit/shared-types/schemas/config-file.v1.json`.

## Things that will cost you an afternoon

- **Flag settings must be declared as strings, not booleans.** `devvit settings set`
  transmits every value as a string and the server coerces it to the declared type;
  coercing `"false"` to a boolean yields `true`. A boolean setting therefore cannot be
  switched off from the CLI. `asBoolean`/`asNumber` in `config.ts` interpret the values.
- **The CLI finds the project by searching upward** from the working directory for
  `devvit.json`. Run `devvit` commands from the repository root. When it fails it says
  `No project devvit.yaml config file found`, which names the wrong file and the wrong
  problem.
- **`devvit settings set` requires the app to exist**, so `devvit upload` comes first.
- **`devvit playtest` watches `devvit.json` too**, not just source — saving a config
  change pushes a new version without any explicit command.
- **Checking is cheap; posting is gated.** A one-minute cron is safe behaviour-wise
  because the time gate limits posting, but it costs ~8,640 YouTube quota units/day
  against a 10,000 limit. The 15-minute schedule costs ~576.
- **`fetched` in the run result counts videos that passed every filter on the source**,
  keyword and orientation alike, not raw API results, because `FilteredVideoSource`
  filters inside `fetchLatest()`.
- **`videos.list` omits `player.embedWidth`/`embedHeight` unless `maxHeight` or
  `maxWidth` is sent.** Drop that parameter and every video comes back with no aspect
  ratio, `LandscapeOnlyFilter` fails open on all of them, and the vertical filter becomes
  a silent no-op. The `aspect-ratio:` log line exists to make that visible.
- **`devvit upload` does not update any install.** It creates a version; subreddits stay
  on whatever they had until `devvit install <subreddit> <app>@<version>` runs. A new
  setting will not appear in `devvit settings list` until an install is actually on the
  version that declares it.
- **A private app cannot be upgraded in a subreddit with 200+ subscribers.** An install
  from when the subreddit was smaller keeps working, but upgrading it fails with
  `You're only allowed to install private apps in small subreddits (<200 subs)`. r/BastropTX
  is over that line, so shipping anything there requires `devvit publish` and review;
  r/bastrop_test is not, and takes upgrades directly.
- **`devvit publish` is interactive.** It prompts before packaging the source zip, so it
  cannot be driven from a non-interactive shell. The zip respects `.gitignore` -- which
  is what keeps the dotenv files out of it, and why an untracked scratch file in the
  working tree ships to reviewers.
- **Devvit cron is UTC; Central time lives in the use case.** Do not "fix" the digest
  to a daily cron at 13:00 UTC: it would drift an hour at every DST change.
- **The county source has messy dates.** `bastropcountycalendar.com/api/public/events`
  (documented in the site's `/llms.txt`; use it, not the older `/api/events`) returns
  naive local datetimes and date-only or missing ends on timed events.
  `normalizeEvent` in `apps-script/Parse.js` handles them for every source.
- **The city source is an undocumented vendor API.** `api.withapps.io` serves the City
  of Bastrop calendar widget (org 56, community 261); found by capturing the widget's
  network calls. Its `plainDescription` is lowercased (use the HTML `description`), its
  UTC fields put evening events on the next day (use the local `startsAt` when
  `timezone` is Central), it repeats some occurrences under different ids, and
  `isApproved` is false on everything the city shows. It is off unless the
  `CITY_SOURCE_ENABLED` script property is `on`.
- **A public calendar read never sees `source`.** The Calendar API documents `source`
  as "Can only be seen or modified by the creator of the event", and the digest reads
  with an API key. Event links therefore come from the description's last line
  (`eventLink` in `googleCalendarEventSource.ts`), which the sync keeps as the page URL
  even when it shortens a description. Previews built from source data, not from a
  real API-key read of the calendar, will not show this kind of problem.
- **Worship services reach the digest as a count, via a shared extended property.**
  The sync sets `extendedProperties.shared.digestGroup = "worship"` on county records
  tagged `worship` (shared, not private, so the API-key read in
  `googleCalendarEventSource.ts` sees it), and `buildDailyDigest` counts those instead
  of listing them. The source's URLs and titles do not identify them reliably; the tag
  does.
- **A source is only ever allowed to delete its own events, and only after a
  non-empty read.** `isOrphan` checks the id prefix (`bcc`, `bcob`) against the sources
  that answered this run. Keep it that way: a vendor outage that returns `[]` would
  otherwise wipe that source from the calendar.
- **Apps Script does not guarantee file load order.** Top-level values in one file must
  not reference another file's functions directly; `SOURCE_READERS` wraps them.
- **Calendar event labels need `eventLabelVersion=1` on every event write**, or
  `eventLabelId` is ignored. On a labelled write, omitting `eventLabelId` clears the
  label, so patches always send it. The sync calls the REST API through
  `calendarRequest` in `apps-script/Sync.js` rather than the Advanced Calendar service,
  whose client may predate labels. Category to label matching lives in
  `apps-script/Labels.js`.
- **`clasp create` overwrites `apps-script/appsscript.json`** with Google's default
  manifest (New York time zone, no scopes), and **`clasp push` silently prints
  `Skipping push.`** when the manifest changed, unless given `--force`. Always
  `npx @google/clasp push --force`, and restore the manifest after any `create`.
- **The Advanced Calendar service must stay in `appsscript.json`** even though the code
  calls the REST API directly. Declaring it is what enables the Calendar API on the
  script's hidden default Cloud project; remove it and every call fails with
  `HTTP 403 -- Google Calendar API has not been used in project …`.
- **"Multi-day" means longer than 25 hours**, not "ends on a different date". That
  threshold keeps an all-day event on the 25-hour fall-back day and an 8 PM–1 AM show
  single-day, so neither gets a "through" date.
- **Sticky needs the `moderator` Reddit scope** in `devvit.json`; the default `user`
  scope cannot pin. Changing the scope may make moderators re-approve the app's
  permissions on upgrade.
- **Deleting an event in the calendar suppresses it.** The sync uses deterministic ids
  (`bcc` + SHA-256 of the source id) and never recreates a cancelled one. That is the
  moderator's way to keep a listing out of the digest.

## Constraints that come from policy, not preference

- **Posts must be attributed to the app account** (`runAs: 'APP'`). Devvit rejects apps
  that automate actions on behalf of a redditor.
- **Stored YouTube metadata expires after 30 days** (`VIDEO_RETENTION_SECONDS`),
  matching the YouTube Developer Policies cap. Safe for dedup: the 48-hour age window
  means an expired record can never be re-queued.
- **`dryRun` defaults to on**, so a fresh install cannot post until someone decides it
  should.
- **Publishing requires policy URLs, and they are already saved.** Because the app uses
  HTTP fetch, `devvit publish` refuses to submit until a Privacy Policy URL and a Terms
  URL are set on the app's developer-settings page. Both are configured, pointing at the
  copies rendered on GitHub:
  - https://github.com/Symphon-y/bastrop-news/blob/main/docs/privacy.md
  - https://github.com/Symphon-y/bastrop-news/blob/main/docs/terms.md

  `docs/privacy.md` and `docs/terms.md` are the source of those pages, so editing them
  changes what the saved URLs serve -- there is no separate hosted copy to keep in sync.
  They carry YouTube-mandated disclosures and should not be trimmed without checking the
  YouTube API Services Developer Policies.
- **The README is a review criterion.** Reddit rejects apps whose README is missing,
  templated, or vague, and requires a `## Fetch Domains` section justifying each domain.

## Conventions

Comments explain why something is done when that is not obvious from the code. They do
not restate what the code says, and they do not describe how the code used to work.
