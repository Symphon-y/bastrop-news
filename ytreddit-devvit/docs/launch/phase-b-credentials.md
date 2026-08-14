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

- [x] Ran `npm run check:filters` — **2026-08-14: risk cleared**

**Result (2026-08-14), against full Data API descriptions:**

| Channel | Passed filter | Within 48h | Fetch depth |
| --- | --- | --- | --- |
| Bastrop TX Network (unfiltered) | 15/15 | **1** | 101.7d |
| KVUE (`bastrop`) | **0/15** | 0 | 10.1h |
| KXAN (`bastrop`) | **0/15** | 0 | 11.6h |

- **No description-boilerplate problem.** Neither station's footer mentions Bastrop, so
  the keyword filter is doing real work. `KeywordFilter` can stay as-is (title *and*
  description), which is the more useful behaviour — it catches stories that mention
  Bastrop without putting it in the headline.
- **A fresh install starts nearly silent.** Exactly one video is currently inside the
  48h window (a city council meeting, ~33h old), so the bot would post that and then
  wait. The main channel's back catalogue reaches 101 days inside a single 15-item
  fetch, and the age window correctly excludes all of it.
- **Fetch depth is not a bottleneck.** 15 items covers 10–12 hours of uploads even on
  the busy news channels — roughly 40× the 15-minute poll interval, so nothing scrolls
  out of view between runs. `MAX_RESULTS = 15` stays.

**Reading the result (for future re-runs):**

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

**Run every `devvit` command from `ytreddit-devvit/`, not the repo root.** The CLI
finds the project by searching *upward* from your working directory for `devvit.json`
(`project.js:181`), so from the repo root it never looks down into the subdirectory.
When it fails it reports:

```
Error: No project devvit.yaml config file found.
```

That message is misleading — `devvit.json` is fully supported; the CLI just hardcodes
the legacy `devvit.yaml` filename in the error string (`DevvitCommand.js:81`). It means
"wrong directory", not "wrong config format".

**The app must exist server-side before settings can be set.** `devvit settings set`
looks the app up by slug and bails with *"Your app doesn't exist yet - you'll need to
run 'devvit upload' before you can set settings"* (`set.js:34`). So the order is:

```bash
cd ytreddit-devvit

npx devvit login          # opens a browser
npx devvit whoami         # confirm the account

npm run build             # devvit.json's referenced files must exist, or the CLI
                          # errors with "references files that don't exist"
npx devvit upload         # creates the app; needed before any settings exist

npx devvit settings set youtubeApiKey   # paste the key at the prompt
npx devvit settings list                # confirm it's stored (stays masked)
```

- [x] Logged in as the account that should own the app
- [x] `npx devvit upload` succeeded. The app is registered as **`bastrop-news`** —
      renamed from `ytreddit-devvit` during upload (app names are globally unique,
      max 20 chars, `^[a-z][a-z0-9-]*$`). `devvit.json` and `package.json` both carry
      the new name; the *directory* is still `ytreddit-devvit/`.
- [x] All five settings registered server-side, confirmed via `devvit settings list`

> **`settings list` does not prove the key's value is stored.** It calls `GetForm` and
> prints only the setting *definitions* — key, label, type, is-secret (`list.js`,
> `displayAppSettingsKeys`). There's no value column, and a secret can't be read back
> by design. The real confirmation comes in Phase C: if the key is missing,
> `loadConfig()` throws `youtubeApiKey setting is not configured` in the logs.

Uploading here is safe and does **not** make the app public: an uploaded-but-unpublished
app is visible only to you and installable only to subreddits under 200 subscribers —
which is exactly what r/bastrop_test is. Publishing to r/BastropTX is Phase D.

Leave `dryRun` alone. It defaults to **on**, which is what Phase C wants.

## B4 — Pick the test subreddit

Needs a subreddit you moderate with **fewer than 200 subscribers** (Devvit enforces that
limit for unpublished apps). A fresh private sub is fine.

- [x] Test subreddit: **`bastrop_test`** — 12 chars, matches the required
      `^[a-zA-Z][a-zA-Z0-9_]*$` pattern, within the 3–21 limit
- [x] `dev.subreddit` set in `devvit.json`; re-validated against the schema

## Exit criteria

- API key created, restricted, and stored as a Devvit secret
- B2 came back clean, or the filter was fixed and its tests updated
- `npx devvit whoami` shows the right account
- `dev.subreddit` names a real test sub you moderate

→ Continue to [Phase C](./phase-c-playtest.md).
