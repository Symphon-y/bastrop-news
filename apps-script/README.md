# Events calendar sync (Google Apps Script)

Copies public event listings into a public Google Calendar once a day, at 5 AM Central.
The Devvit app's 7 AM events digest reads that calendar, and people can subscribe to it
directly. There are two sources, both used with their owners' permission:

| Source | What it covers | How it is read |
| --- | --- | --- |
| [bastropcountycalendar.com](https://bastropcountycalendar.com) | An aggregator of 25+ calendars: Bastrop County, City of Elgin, Smithville, the Chamber, Discover Bastrop, churches, and Bastropia's own listings | Its documented public API, `/api/public/events?from=&to=` (`Parse.js`) |
| [City of Bastrop Community Calendar](https://connect.cityofbastrop.org/bastroptx/calendar) | City Council and board meetings, the public library, Parks & Recreation, and local businesses. The aggregator carries none of these | The JSON endpoint its calendar widget uses on `api.withapps.io` (`CitySource.js`). Off until the `CITY_SOURCE_ENABLED` script property is `on` |

The two overlap very little (one shared listing in 45 days when this was written).
Where they do, the aggregator's copy is kept.

This script runs on Google's infrastructure under the Google account that owns the
calendar. It is not part of the Devvit app and is not uploaded to Reddit.

## What it does

Each run:

1. **Reads each enabled source** for today through the next 45 days. The county
   source is required: if it fails, the run fails. The city source is optional: if it
   fails, the run logs it under `skippedSources` and leaves the city's events as they are.
2. **Normalizes each event** into one shared shape (`normalizeEvent` in `Parse.js`).
   - Times are local to `America/Chicago`.
   - Timed events with a missing or date-only end get one hour.
   - All-day end dates are inclusive.
   - Records with malformed dates are skipped and counted.
   - City events with a one- or two-word title get their organizer added ("TRIVIA at Bastrop Beer Company").
3. **Marks routine worship services:** county records tagged `worship` get
   `digestGroup: "worship"` as a shared extended property, which the digest turns into
   one count line instead of ~58 Sunday listings.
4. **Drops duplicates** (`dedupeEvents`): exact repeats within a source, and a city
   event with the same title on the same day as a county one. Counted as `duplicates`.
5. **Gives each event a deterministic calendar id:** a source prefix (`bcc` for the
   county, `bcob` for the city) + SHA-256 of the source id. That makes every run idempotent.
6. **Labels each event by category** (`Labels.js`). See *Labels* below.
7. **Writes changes to the calendar.**
   - Creates events that are missing.
   - Updates events whose source `updatedAt` changed.
   - Deletes an event only when its own source answered this run, with at least one
     event, and no longer lists it (`isOrphan`). An outage or an empty response never
     deletes anything.
   - Past events are left alone.
8. **Logs a summary**, e.g. `{"created":12,"updated":1,"deleted":0,"suppressed":1,"duplicates":3,"fetched":{"bcc":614,"cob":116},"skippedSources":[],...}`.

**Deleting an event in Google Calendar suppresses it.** The script sees the deleted
entry, remembers it, and never recreates it, so it also never reaches a digest. That is
how a moderator removes a listing without touching the source site.

## Labels

Every event carries one of the site's categories, and the script turns it into a Google
Calendar event label.

- **City events** have no category field. `cityCategory` in `Labels.js` picks one from
  the title, then the organizer: anything the city's "Public Meetings" account posts is
  Government, "live music" is Music, "farm stand" is Markets, a library event with no
  better match is Education, and so on.
- **Categories.** The county site has 12 canonical categories: Community, Arts & Entertainment,
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

**Why daily.** One read of each source a day keeps the load on both negligible: the
county API returns only the 45-day window, and the city takes three 50-event pages. Running at 5 AM means each morning's digest sees the newest listings. The
trade-off is that a listing added or changed during the day reaches the calendar the
next morning.

## Setup

1. **Create the calendar.**
   - Google Calendar → *Other calendars* → **+** → *Create new calendar*. Name it e.g. "Bastrop County Events" and set the time zone to Central.
   - In its settings, under *Access permissions for events*, check **Make available to public** with *See all event details*. The Devvit app reads it with an API key, which only works on public calendars.
   - Copy the **Calendar ID** from *Integrate calendar*. It looks like `…@group.calendar.google.com`.
   - Use this calendar only for the sync: the script treats every event whose id starts with `bcc` or `bcob` as its own.
2. **Create the script project** at [script.google.com](https://script.google.com), signed in as the calendar's owner.
   - **With [clasp](https://github.com/google/clasp):** the project already exists, and `.clasp.json` at the repository root points at it. From the root, run `npx @google/clasp login`, then `npx @google/clasp push --force`. `--force` is needed whenever the manifest changed; without it clasp prints `Skipping push.`
     - To start a fresh project instead, run `npx @google/clasp create-script --type standalone --title "Bastrop County Events Sync" --rootDir apps-script`. Then restore `apps-script/appsscript.json` from git, because `create-script` overwrites it with Google's default, and push with `--force`.
   - **Or by hand:** create four script files named `Labels`, `Parse`, `CitySource` and `Sync`, and paste in the matching `.js` files. Turn on *Show "appsscript.json"* in Project Settings and paste in `appsscript.json`.
     - The manifest lists the **Google Calendar API** advanced service. The code calls the REST API directly, but declaring the service is what turns the Calendar API on for the script's Cloud project. Without it every call fails with `HTTP 403 -- Google Calendar API has not been used in project …`.
3. **Set the script properties:** *Project Settings* → *Script properties*:
   - `CALENDAR_ID` = the ID from step 1.
   - `CITY_SOURCE_ENABLED` = `on` to include the City of Bastrop calendar. Leave it out
     (or set anything else) to sync only the county aggregator.
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
- **`unparseable`** counts source records with dates the script cannot read. A handful is normal.
- **With the city on,** a City Council or library event should appear, labelled
  Government or Education, linking to its connect.cityofbastrop.org page. Turning
  `CITY_SOURCE_ENABLED` off again leaves those events in place; they are not deleted.

## Tests

Everything here is tested from the main repository with `npm test`:
- **Pure logic** (parsing, ids, categories, labels, dedupe, orphans):
  `appsScriptParse.test.ts` and `appsScriptCitySource.test.ts`, which load the files
  into a sandbox (`tests/fakes/appsScriptSandbox.ts`).
- **The whole sync:** `appsScriptSync.test.ts` runs `syncEvents()` against in-memory
  Calendar, source and properties fakes. It covers idempotency, cross-source dedupe, a
  city outage, switching the city off, empty responses, and moderator deletions.
