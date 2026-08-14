# Phase C — playtest

Goal: prove the app builds, installs, runs on schedule, and picks sane videos — in a
throwaway subreddit, with `dryRun` on, before anything can reach r/BastropTX.

## C1 — Local green light

```bash
npm ci
npm test          # expect 37 passing
npm run typecheck
npm run build     # expect dist/server/index.cjs
```

- [ ] All three clean

## C2 — First playtest run (dry run ON)

Run this from `ytreddit-devvit/` — the CLI searches *upward* for `devvit.json`, so the
repo root fails with the misleading `No project devvit.yaml config file found`.

```bash
cd ytreddit-devvit
npx devvit playtest bastrop_news_dev
```

`playtest` installs the app, watches for changes, and streams logs. It should run
`devvit.json`'s `scripts.dev` (`npm run build:watch`) to produce the bundle.

Watch for, in order:

- [ ] **The bundle is found.** If it fails looking for `dist/server/index.cjs`, run
      `npm run build` in a second terminal and restart — that tells us the CLI isn't
      honouring `scripts.dev`, and the fix is to build before playtesting.
- [ ] **The app installs with no client.** No post type, no `src/client/` — this is
      schema-legal, but this is the first real confirmation.
- [ ] **The fetch domain clears.** `youtube.googleapis.com` is on Devvit's global
      allowlist, but every requested domain is still submitted for review on upload.
      If requests are blocked, that review is why; it should be quick for a Google API.
- [ ] **The cron fires.** The task runs every 15 minutes (`*/15 * * * *`), so the
      first run can take up to 15 minutes. Don't conclude it's broken before then.

## C3 — Read a dry run

Each run logs one `queued <videoId>: <title>` line per accepted video, then a summary
ending in `(DRY RUN -- nothing posted)`. `gateStatus` will be `dry_run` whenever there
was something it would have posted.

```bash
npx devvit logs bastrop_news_dev
```

Phase B2 already measured what this *should* look like against live data, so these are
concrete expectations, not vibes:

- [ ] `fetched` is **45** (3 channels × 15 items)
- [ ] `newlyQueued` on the very first run is **small — likely 1**, from Bastrop TX
      Network. The other 14 of its uploads are outside the 48h window, and both news
      channels currently match nothing. A first run that queues dozens means something
      is wrong with the age window, not with the filter.
- [ ] Every `queued` title is one you'd actually want on r/BastropTX. A stream of
      KXAN/KVUE titles with no Bastrop connection would mean a station changed its
      description boilerplate since B2 — re-run `npm run check:filters` to confirm,
      then make `KeywordFilter` title-only for the news channels.
- [ ] Subsequent runs report `newlyQueued: 0` until someone actually uploads
- [ ] `wouldPost` names a sensible video
- [ ] No `youtubeApiKey setting is not configured` error (if you see it, redo B3)

Let it sit for a few cycles. Nothing can post while `dryRun` is on, so this is free.

## C4 — Let it post for real, in the test sub

```bash
npx devvit settings set dryRun    # answer false / off
```

- [ ] A real link post appears in the test subreddit
- [ ] Title and URL match the video; it's a plain link post, not an interactive post
- [ ] The post is submitted by the **app account**, not your user account

## C5 — Prove the anti-spam rules hold

- [ ] **Time gate.** The next run within the hour logs `gate_closed` and posts nothing
      — even with videos still queued. This is the single most important behaviour;
      without it a busy news day floods the sub.
- [ ] **Dedup.** Later runs re-fetch the same videos and report `newlyQueued: 0`.
- [ ] **Age window.** No video older than 48 h is ever queued — the back-catalogues of
      three channels stay out.
- [ ] **Drain order.** With several queued, they post oldest-first, one per hour.

Waiting a real hour is the honest way to confirm the gate. To move faster,
temporarily `npx devvit settings set minSecondsBetweenPosts` to `120` — **and set it
back to `3600` before Phase D.**

- [ ] `minSecondsBetweenPosts` restored to 3600
- [ ] `dryRun` set back to **on** before touching r/BastropTX

## Exit criteria

- Builds, installs, and the cron fires unattended
- Dry-run logs show only videos that belong on r/BastropTX
- A real post landed in the test sub from the app account
- Gate, dedup, and age window all confirmed on live data
- Settings restored (`minSecondsBetweenPosts: 3600`, `dryRun: on`)

→ Continue to [Phase D](./phase-d-go-live.md).
