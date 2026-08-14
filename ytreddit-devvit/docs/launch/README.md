# Launch plan

Ordered path from "code is written" to "bot is live on r/BastropTX". Work the phases
in order; each has its own file with the exact commands and the checks that have to
pass before moving on.

| Phase | File | Needs | Status |
| --- | --- | --- | --- |
| A — Build & safety rails | (done, see below) | nothing | ✅ complete |
| B — Credentials & config | [phase-b-credentials.md](./phase-b-credentials.md) | Google + Reddit logins | 🟡 B1, B2, B4 done; B3 in progress |
| C — Playtest | [phase-c-playtest.md](./phase-c-playtest.md) | r/bastrop_test | ⬜ not started |
| D — Go live | [phase-d-go-live.md](./phase-d-go-live.md) | r/BastropTX mod access, app review | ⬜ not started |

**Deployment path is settled:** r/BastropTX has **5,503 subscribers**, well over the
200-subscriber ceiling for unpublished apps. Going live needs `devvit publish` (review
request, source submitted), not `devvit upload`. `publish` defaults to *unlisted*, so
the app is reviewed but never listed publicly. Budget for a review turnaround, and get
the app icon made before submitting — see Phase D.

## Phase A — complete

What changed, and why it was needed:

- **Real build step.** `devvit.json` pointed `server.entry` at a `dist/server/index.js`
  that nothing in the repo produced. The schema requires a self-contained **CommonJS**
  bundle, but `package.json` is `"type": "module"`. Added an esbuild bundle
  (`npm run build` → `dist/server/index.cjs`, ~3.9 MB, ~90 ms) and wired
  `devvit.json`'s `scripts.build` / `scripts.dev` hooks so `devvit upload` and
  `devvit playtest` build it themselves.
- **Pinned the CLI.** `devvit@0.14.0` is now a devDependency instead of a floating
  `npx devvit`, matching the pinned `@devvit/*` libraries.
- **Dry-run mode.** New `dryRun` global setting, **defaulting to ON**. A dry run
  fetches, filters and queues normally, then logs the post it *would* have submitted —
  without publishing, without marking anything posted, and without advancing the
  post time-gate. Videos queued during a dry run post normally once it's switched off.
- **Per-run queue logging.** `RunResult.queuedThisRun` lists every video accepted this
  run, and the scheduler handler logs each title. This is what makes the keyword
  filter's real behaviour visible before it can flood a subreddit.
- **Closed the `RedisVideoQueueStore` test gap.** The adapter now takes its client by
  constructor injection (same pattern `RedditPublisher` already used), so it's tested
  against a small in-memory `FakeRedis` — no Devvit plugin-mock harness needed.

Verified locally: **37 tests pass**, `tsc --noEmit` clean, `npm run build` produces a
syntactically valid CJS bundle, and `devvit.json` validates against
`@devvit/shared-types/schemas/config-file.v1.json`.

## Things already confirmed, so nobody re-checks them

- All three channel IDs in `src/server/channelsConfig.ts` resolve to the right
  channels (Bastrop TX Network, KVUE, KXAN), verified against the public YouTube
  RSS feeds.
- `redis.get()` really does resolve to `string | undefined`, so the adapter's
  `!== undefined` dedup check is correct.
- `reddit.submitPost({subredditName, title, url, runAs: 'APP'})` matches the
  published `SubmitLinkOptions` type.
- A client-less app (no `src/client/`, no post type) is schema-legal — only `name`
  is a required top-level field in `devvit.json`.
- Channel cadence: Bastrop TX Network uploads a few times a month; KVUE and KXAN
  upload constantly (15 uploads per 10–12 hours).
- **The keyword-filter blowout risk is cleared** (2026-08-14). Neither KVUE's nor
  KXAN's description boilerplate mentions Bastrop — 0/15 recent uploads match on
  either channel — so `KeywordFilter` keeps matching descriptions as well as titles.
  Full numbers in Phase B.
- **Fetch depth is fine.** 15 items per channel covers 10–12 h of uploads even on the
  busy news channels, ~40× the 15-minute poll interval, so nothing is missed between
  runs. `MAX_RESULTS = 15` needs no change.
