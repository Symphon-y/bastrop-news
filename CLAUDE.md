# bastrop-news

A [Devvit](https://developers.reddit.com/docs) app that watches a fixed list of YouTube
channels and posts new videos to the subreddit it is installed in. Built for
**r/BastropTX**; playtested against **r/bastrop_test**. It runs on Reddit's
infrastructure — there is no server, container, or host machine involved.

The Devvit app name is `bastrop-news` (`name` in `devvit.json` and `package.json`).

See `README.md` for what the app does, its settings, quota math, and deployment. This
file covers what is worth knowing before changing the code.

## Architecture

Ports and adapters:

```
src/server/
├── domain/video.ts              Video -- the one domain type
├── application/
│   ├── ports.ts                 VideoSource, VideoQueueStore, PostFormatter,
│   │                            Publisher, VideoFilter
│   └── checkAndPost.ts          CheckAndPostUseCase -- the only orchestration
├── infrastructure/              one adapter per port
├── channelsConfig.ts            watched channels (checked in, not secret)
├── config.ts                    settings, coercion, target subreddit
└── index.ts                     composition root / scheduler endpoint
```

`CheckAndPostUseCase.run()` ingests (fetch every filtered source, enqueue anything new
inside the age window) then posts under a time gate (if enough time has passed, publish
the oldest pending video). `dryRun` suppresses publishing, marking posted, and advancing
the gate, while leaving ingest intact.

## Testing

`npm test` — 48 Vitest tests, no network and no Devvit runtime. Adapters that wrap a
Devvit singleton (`RedditPublisher`, `RedisVideoQueueStore`) take their client by
constructor injection and are tested against in-memory fakes in `tests/fakes/`.

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
- **`fetched` in the run result counts videos that passed the keyword filters**, not raw
  API results, because `FilteredVideoSource` filters inside `fetchLatest()`.

## Constraints that come from policy, not preference

- **Posts must be attributed to the app account** (`runAs: 'APP'`). Devvit rejects apps
  that automate actions on behalf of a redditor.
- **Stored YouTube metadata expires after 30 days** (`VIDEO_RETENTION_SECONDS`),
  matching the YouTube Developer Policies cap. Safe for dedup: the 48-hour age window
  means an expired record can never be re-queued.
- **`dryRun` defaults to on**, so a fresh install cannot post until someone decides it
  should.
- **Publishing requires policy URLs.** Because the app uses HTTP fetch, `devvit publish`
  refuses to submit until a Privacy Policy URL and a Terms URL are saved on the app's
  developer-settings page. `docs/privacy.md` and `docs/terms.md` are the source; they
  carry YouTube-mandated disclosures and should not be trimmed without checking the
  YouTube API Services Developer Policies.
- **The README is a review criterion.** Reddit rejects apps whose README is missing,
  templated, or vague, and requires a `## Fetch Domains` section justifying each domain.

## Conventions

Comments explain why something is done when that is not obvious from the code. They do
not restate what the code says, and they do not describe how the code used to work.
