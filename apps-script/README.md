# Events calendar sync (Google Apps Script)

Copies the public event listings from
[bastropcountycalendar.com](https://bastropcountycalendar.com) into a public Google
Calendar once a day, at 5 AM Central. The Devvit app's 7 AM events digest reads that
calendar. People
can also subscribe to it directly.

This script runs on Google's infrastructure under the Google account that owns the
calendar. It is not part of the Devvit app and is not uploaded to Reddit.

## What it does

Each run:

1. **Fetches** `https://bastropcountycalendar.com/api/events`, which returns every listed event as JSON.
2. **Normalizes each event** (`Parse.js`).
   - Times are local to `America/Chicago`.
   - Timed events with a missing or date-only end get one hour.
   - All-day end dates are inclusive.
   - Records with malformed dates are skipped and counted.
3. **Keeps events in the window:** anything touching today through the next 45 days.
4. **Gives each event a deterministic calendar id:** `bcc` + SHA-256 of the source id. That makes every run idempotent: the same source event always maps to the same calendar entry.
5. **Labels each event by category** (`Labels.js`). See *Labels* below.
6. **Writes changes to the calendar.**
   - Creates events that are missing.
   - Updates events whose source `updated_at` changed.
   - Deletes events whose source listing disappeared.
   - Past events are left alone.
7. **Logs a summary**, e.g. `{"created":12,"updated":1,"deleted":0,"suppressed":1,"labeled":259,"unlabeled":0,"labelsCreated":0,...}`.

**Deleting an event in Google Calendar suppresses it.** The script sees the deleted
entry, remembers it, and never recreates it, so it also never reaches a digest. That is
how a moderator removes a listing without touching the source site.

## Labels

Every event carries one of the site's categories, and the script turns it into a Google
Calendar event label.

- **Categories.** The site has 12 canonical categories: Community, Arts & Entertainment,
  Music, Family & Kids, Markets & Shopping, Sports & Outdoors, Education, Business &
  Networking, Government & Civic, Health & Wellness, Food & Drink, and Faith & Worship.
  Older listings use legacy slugs such as `classes`, `family`, `kids` and `government`,
  which `CATEGORY_ALIASES` folds into the canonical ones. `classes` (yoga, Zumba, tai
  chi) counts as Health & Wellness.
- **Reusing your labels.** Each run reads the calendar's labels and matches them to
  categories before creating anything:
  - **Exact:** the name equals the site's chip name or full name, e.g. "Music", or "Family & Kids".
  - **Close:** the name is part of the full name, e.g. "Arts" for Arts & Entertainment, or
    "Outdoors" for Sports & Outdoors.
  - **Typo:** one letter off in a word of five letters or more, e.g. "Comunity".
  - The best match wins, and a label serves only one category. Your labels' names and
    colors are never changed.
- **Creating the rest.** Any category with no match gets a new label named after the
  site's chip or first word (Education, Business, Government, Health, Food, Faith), in the
  site's own color for that category.
- **Changing labels by hand.** The sync keeps a label you change on an event. It only
  re-labels an event when the site moves it to a different category.
- **Renaming or recoloring** a label in Google Calendar is safe: events keep it, because
  they reference its id.
- **Deleting a label** makes the next run create a replacement. Events that pointed at
  the deleted one are only re-labelled when their source listing changes category.

Labels are written through the Calendar REST API with `eventLabelVersion=1`, which the
API requires for `eventLabelId` to take effect. That is why the script calls the API
over `UrlFetchApp` instead of through the Advanced Calendar service. The service stays in
the manifest only to keep the API enabled.

**A large batch may take more than one run.** Each run stops writing after four minutes,
to stay under Apps Script's six-minute limit, and leaves the rest for the next run. The
summary's `deferred` count shows what is left. The first fill usually completes in one
run; if not, run `syncEvents` by hand again.

**Why daily.** Each sync downloads the site's whole event list, about 220 KB compressed;
its API has no date filter. One request a day keeps the load on bastropcountycalendar.com
negligible. Running at 5 AM means each morning's digest sees the newest listings. The
trade-off is that a listing added or changed during the day reaches the calendar the
next morning.

## Setup

1. **Create the calendar.**
   - Google Calendar → *Other calendars* → **+** → *Create new calendar*. Name it e.g. "Bastrop County Events" and set the time zone to Central.
   - In its settings, under *Access permissions for events*, check **Make available to public** with *See all event details*. The Devvit app reads it with an API key, which only works on public calendars.
   - Copy the **Calendar ID** from *Integrate calendar*. It looks like `…@group.calendar.google.com`.
   - Use this calendar only for the sync: the script treats every event whose id starts with `bcc` as its own.
2. **Create the script project** at [script.google.com](https://script.google.com), signed in as the calendar's owner.
   - **With [clasp](https://github.com/google/clasp):** run `clasp create --type standalone --rootDir apps-script` from the repository root, then `clasp push`.
   - **Or by hand:** create three script files named `Labels`, `Parse` and `Sync`, and paste in `Labels.js`, `Parse.js` and `Sync.js`. Turn on *Show "appsscript.json"* in Project Settings and paste in `appsscript.json`.
     - The manifest lists the **Google Calendar API** advanced service. The code calls the REST API directly, but declaring the service is what turns the Calendar API on for the script's Cloud project. Without it every call fails with `HTTP 403 -- Google Calendar API has not been used in project …`.
3. **Set the calendar ID:** *Project Settings* → *Script properties* → add `CALENDAR_ID` = the ID from step 1.
4. **Run it once by hand.**
   - Choose `syncEvents` in the editor toolbar and click **Run**. Approve the access prompt: the script needs Calendar, external requests, and triggers.
   - Check the execution log for the summary line.
   - Run it again until `deferred` is `0`.
5. **Schedule it:** run `installTrigger` once. It replaces any existing `syncEvents` trigger with a daily one that runs between 5 and 6 AM Central (`SYNC_HOUR` in `Sync.js`). Apps Script emails the owner when a scheduled run fails.
6. **Point the Devvit app at the calendar:**
   - Put the Calendar ID in `EVENTS_CALENDAR_ID` in `src/server/eventsConfig.ts`.
   - Enable the **Google Calendar API** in the Google Cloud project that holds the app's API key.

## Checking it

- **A second run right after a complete one** should report `created: 0` and `updated: 0`.
- **Deleting one event in Google Calendar,** then running again, should count it under `suppressed` and not bring it back.
- **The first run's log** should list `created label "…"` only for categories you had no label for.
- **Spot-check labels in the Calendar UI**, e.g. a yoga class (Health), a chamber luncheon (Business) or a Commissioners Court meeting (Government).
- **Unconfirmed:** whether labels show to people who *subscribe* to the public calendar, rather than its owner. Check from another account.
- **`unlabeled`** counts events whose category is unknown; the log lists those categories. Add them to `CATEGORY_ALIASES`.
- **`unparseable`** counts source records with dates the script cannot read. A handful is normal; the source contains entries like `"January 1, 1863T00:00:00"`.

## Tests

The parsing, id, category and label-matching logic in `Parse.js` and `Labels.js` is
unit-tested from the main repository: `npm test` runs
`tests/unit/appsScriptParse.test.ts`, which loads both files into a sandbox. `Sync.js` calls Calendar directly and is checked by the manual runs above.
