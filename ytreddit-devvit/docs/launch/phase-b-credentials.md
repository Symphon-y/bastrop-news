# Phase B — credentials & config

Everything here needs a browser login, so these are steps *you* run. In Claude Code
you can prefix a command with `!` to run it in the session so the output lands in the
conversation.

## B1 — Create the YouTube Data API key (~3 minutes)

Use these deep links; they skip the console navigation entirely.

- [ ] **Create a project** → https://console.cloud.google.com/projectcreate
      — any name (`ytreddit-bot`), no organization needed
- [ ] **Enable the API** → https://console.cloud.google.com/apis/library/youtube.googleapis.com
      — check the new project is selected in the top bar, click **Enable**
- [ ] **Create the key** → https://console.cloud.google.com/apis/credentials
      — **+ Create credentials → API key**, copy it from the popup
- [ ] **Restrict it**: pencil icon → **API restrictions → Restrict key → YouTube Data API v3** → Save
- [ ] **Leave *Application restrictions* on "None"** — requests originate from Reddit's
      servers, so there's no stable IP or referrer to pin. Most tutorials say to set
      HTTP referrers; that would break this bot.

**No billing account is needed.** The 10,000 units/day free tier requires no card, and
this bot uses ~576/day.

> Why not the `gcloud` CLI? Creating keys programmatically goes through
> `apikeys.googleapis.com`, whose docs require **billing enabled** plus the
> `roles/serviceusage.apiKeysAdmin` role — neither of which the console path needs.
> For a single key it's slower to automate than to click.

The key belongs in Devvit's secret store (B3), never in a committed file. For the
local diagnostic in B2, put it in `.env.local` (gitignored):

```bash
cp .env.example .env.local
# then paste the key after YOUTUBE_API_KEY=
```

Quota: each run costs ~2 units per channel (`channels.list` + `playlistItems.list`).
3 channels × 96 runs/day ≈ **576 of the 10,000/day free quota**. `search.list`, which
would cost 100 units per call, is deliberately never used.

## B2 — The keyword-filter blowout check (do this before deploying anything)

`KeywordFilter` matches the video **description** as well as the title. Local TV
stations usually append a boilerplate footer to every description listing the counties
they cover. **If "Bastrop" appears in KXAN's or KVUE's standard footer, every single
one of their uploads matches the filter** — and those channels upload many times a day.

The public RSS feeds look clean (0/15 KVUE, 1/15 KXAN, and that one matched on the
title), **but RSS truncates descriptions**. Only the Data API returns the full text,
so this can't be settled without the key from B1.

With the key in `.env.local`:

```bash
npm run check:filters
```

This runs the app's **real** `YoutubeDataApiSource` and `KeywordFilter` against live
channel data — not a reimplementation — so what it prints is exactly what the bot
would queue. It never prints the key.

- [ ] Ran `npm run check:filters`

**Reading the result:**

- **A handful of matches, all tagged `TITLE`** — filter is healthy, continue to B3.
- **Many matches tagged `DESCRIPTION-ONLY`** (the script warns above 2) — the
  boilerplate problem is real. Do **not** deploy as-is. The cheapest fix is making
  `KeywordFilter` title-only for the news channels: a small change to
  `videoFilters.ts` plus a per-channel flag in `channelsConfig.ts`, covered by the
  existing filter tests.
- Also sanity-check the raw volume line at the bottom. The main channel is unfiltered,
  so its whole recent upload list counts — but the 48 h age window trims that at
  runtime, and the 1-per-hour gate paces whatever survives.

## B3 — Devvit login and settings

```bash
npx devvit login            # opens a browser
npx devvit whoami           # confirm the account
npx devvit settings set youtubeApiKey   # paste the key at the prompt
npx devvit settings list    # confirm it's stored (value stays masked)
```

- [ ] Logged in as the account that should own the app
- [ ] `youtubeApiKey` set

Note: `devvit settings set` writes **global, app-scoped** settings — the app has to
exist server-side first. If this errors before an upload, run it again after the
first `devvit playtest` or `devvit upload` in Phase C.

Leave `dryRun` alone for now. It defaults to **on**, which is what Phase C wants.

## B4 — Pick the test subreddit

`devvit.json` still has the placeholder `"dev": { "subreddit": "REPLACE_WITH_TEST_SUB" }`.
It needs a subreddit that you moderate with **fewer than 200 subscribers** (Devvit
enforces that limit for unpublished apps). A fresh private sub is fine.

- [ ] Test subreddit chosen: `______________`
- [ ] `dev.subreddit` in `devvit.json` updated (must match `^[a-zA-Z][a-zA-Z0-9_]*$`,
      3–21 chars, no `r/` prefix)

## Exit criteria

- API key created, restricted, and stored as a Devvit secret
- B2 came back clean, or the filter was fixed and its tests updated
- `npx devvit whoami` shows the right account
- `dev.subreddit` names a real test sub you moderate

→ Continue to [Phase C](./phase-c-playtest.md).
