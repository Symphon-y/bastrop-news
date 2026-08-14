# Phase D — go live on r/BastropTX

## D0 — Two blockers to settle first

### Are you a moderator of r/BastropTX?

`devvit install` only works on subreddits you moderate. If you aren't a mod, nothing
in this phase can proceed — you'd need a mod to install it, which means they run the
install commands under their own Devvit account.

- [ ] Confirmed mod status

### Subreddit size — settled: `devvit publish` is required

r/BastropTX has **5,503 subscribers** (checked 2026-08-13). That is far above the
200-subscriber ceiling for unpublished apps, so **`devvit upload` + `devvit install`
will not work here**, and the original README's "no app review needed" plan does not
apply.

The path is `devvit publish`, which "creates a new app version, uploads it along with
your source for review, and then files a publish request".

The one piece of good news: **`publish` defaults to *unlisted*.** `--public` is an
opt-in flag, and we don't want it. Unlisted still goes through review, but the app is
never listed in the public App Directory — it just becomes installable beyond the
200-subscriber limit. That's exactly the shape this bot needs.

Consequences to plan around:

- **A human review turnaround.** Don't promise anyone a launch date.
- **Your source code is submitted** with the request.
- **`docs/privacy.md` and `docs/terms.md` are load-bearing** — already written.
- **`--withdraw`** pulls a pending publish request back if you need to fix something.

**Under 200** → the `upload` + `install` path in D2 works as written.

**200 or more** → `upload` is not enough and the README's original plan doesn't apply.
You need `npx devvit publish`, which "creates a new app version, uploads it along with
your source for review, and then files a publish request". That means:

- a human review turnaround, not an instant deploy
- your **source code is submitted** with the request
- `docs/privacy.md` and `docs/terms.md` (already written) become load-bearing —
  publish requests ask for them

Budget for review time before promising anyone a launch date.

## D1 — Pre-flight

- [ ] **App icon.** `devvit.json` has no `marketingAssets` block. The schema requires
      `marketingAssets.icon` whenever that block is present — a square **1024×1024 PNG,
      ≤500 KB**, path relative to the project root. A publish request is very likely to
      want one, so make it before submitting rather than mid-review.
- [ ] **Version.** `publish` bumps patch by default (`package.json` is at `1.0.0`);
      pass `--bump minor` or `--version` if you want something specific.
- [ ] **AutoModerator.** Check r/BastropTX's automod config for link-post rules,
      domain restrictions, or karma/account-age gates. The bot has **no idea** whether
      a post survived — a silently removed post looks like success in the logs, and
      it will keep posting on schedule regardless.
- [ ] **Flair.** If the sub requires post flair, plain link posts may be auto-removed.
      `submitPost` accepts `flairId`/`flairText`; wiring one in is a small change to
      `PassthroughFormatter` + `RedditPublisher` if needed.
- [ ] **Tell the other mods.** An automated poster appearing unannounced is how bots
      get banned.
- [ ] `minSecondsBetweenPosts` is 3600 and `dryRun` is **on**.

## D2 — Submit for review

```bash
npm run build
npx devvit publish                   # NOT --public: unlisted is what we want
```

- [ ] Publish request filed
- [ ] Review approved (`npx devvit list apps` / the confirmation Reddit sends)

`npx devvit publish --withdraw` pulls a pending request back if you spot a problem.

## D2b — Install (after approval)

```bash
npx devvit install BastropTX
npx devvit list installs BastropTX   # confirm it's live
```

- [ ] Installed

While review is pending, keep playtesting in the test subreddit — that's free and it's
the best use of the wait.

## D3 — Dry run in production first

`dryRun` is still on, so the app is live but silent. Give it several cycles.

```bash
npx devvit logs BastropTX
```

- [ ] `queued` lines name only videos that belong on r/BastropTX
- [ ] No repeated errors (quota, auth, fetch domain)
- [ ] `wouldPost` looks right

This is the last checkpoint where a bad filter costs nothing.

## D4 — Go live

```bash
npx devvit settings set dryRun    # answer false / off
```

- [ ] First real post landed on r/BastropTX
- [ ] It survived AutoModerator — **check the sub itself, not just the logs**
- [ ] Second run within the hour reports `gate_closed`

## D5 — Watch the first day

- [ ] Hour 1, hour 6, hour 24: check post volume against expectation. The main channel
      posts a few times a month; KVUE/KXAN should contribute rarely. **More than a
      couple of posts a day means the keyword filter is too broad** — set
      `dryRun` back on immediately, it's the kill switch.
- [ ] Check YouTube quota usage in Google Cloud (expect ~600/10,000 per day)
- [ ] Confirm nothing was removed by automod or reported by users

## Known gaps to live with (or fix later)

- **No removal detection.** If a post is removed, the bot neither notices nor retries.
- **Post-then-record.** `markPosted` runs after a successful submit; if that write
  fails, the same video can post twice on the next run. Narrow window, real risk.
- **No alerting.** A broken API key surfaces only in `devvit logs`. Worth a periodic
  check for the first week.
- **`dryRun` is the only kill switch** and it's a global app setting — flipping it
  stops posting everywhere the app is installed, which is fine for a single install.
