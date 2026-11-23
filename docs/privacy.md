# Privacy Policy — bastrop-news

_Last updated: 2026-11-22_

bastrop-news is a non-commercial Reddit app that posts new videos from a fixed list of
YouTube channels to the subreddit it is installed in and, when moderators turn it on,
a daily digest of local events. This policy describes exactly what it accesses, stores,
and shares.

**This app uses YouTube API Services.** By using it you are also subject to the
[Google Privacy Policy](http://www.google.com/policies/privacy) and the
[YouTube Terms of Service](https://www.youtube.com/t/terms).

The events digest reads a public calendar through the Google Calendar API, which is
governed by the [Google APIs Terms of Service](https://developers.google.com/terms) and the
same Google Privacy Policy.

## Information this app accesses

- **Public YouTube video metadata** — video ID, title, description, publish date, and
  URL — for uploads on a small, fixed list of channels, retrieved through the YouTube
  Data API v3. This is information those channels have already published publicly.
- **Public YouTube player dimensions** — the width and height of a video's embedded
  player — for videos from the TV news channels that have already passed the keyword
  filter. They are used only to tell a vertical Short from the horizontal original of
  the same story, and are discarded once that is decided; they are never stored.
- **Public calendar events** (title, start and end time, venue, and a link to the
  event's page) for the current and next day, read from a public Google Calendar through
  the Google Calendar API v3. That calendar is filled from the public listings on
  [bastropcountycalendar.com](https://bastropcountycalendar.com) and the
  [City of Bastrop Community Calendar](https://connect.cityofbastrop.org/bastroptx/calendar),
  with their owners' permission. Events describe public happenings, not people; an
  organizer's name appears only as the public host of an event.
- **No YouTube or Google account data.** The app authenticates with API keys, not a
  user account. It cannot see any viewer's watch history, subscriptions, or any other
  personal YouTube data, and it never asks anyone to sign in to Google.
- **No Reddit user data.** The app does not read profiles, comment history, votes,
  private messages, or any other account data belonging to any redditor.

Because the app never accesses authorized user data, there is nothing for a user to
revoke. Nobody grants it access to a Google account.

## Information this app stores

In storage private to each installation, the app keeps: video ID, title, description,
URL, publish date, and whether that video has been posted. This exists for two reasons
only — to avoid posting the same video twice, and to pace how often the app posts.

For the events digest it keeps only the date of the last digest it posted, so it posts
once a day, and, when moderators turn on pinning, the Reddit id of the digest post it
pinned, so it can unpin it the next day. **Event details are not stored**; they are read from the calendar when the
digest is written and used only to write it.

**No personal information is stored.** No information about any redditor, viewer, or
channel owner is collected, stored, or profiled. The app stores nothing on or from
anyone's device — it has no client-side component, sets no cookies, and runs no scripts
in anyone's browser.

## How this app uses and shares information

Stored video metadata is used solely to decide whether a video has already been posted
and which one to post next. It is not shared with anyone. No data is sold, and none is
used to train machine learning models.

The app makes two kinds of external request: to `youtube.googleapis.com`, to list
recent uploads for the configured channels and to read the player dimensions of
candidate news videos, and to `www.googleapis.com`, to read the day's events from the
public events calendar. Nothing about any redditor is included in
those requests, because the app never has such information.

No third party serves content or advertisements through this app.

## Information this app publishes

The app submits link posts — a video's title, linking to that video on YouTube — to the
subreddit it is installed in, under the app's own account. When the events digest is
on, it also submits one text post a day listing that day's and the next day's events,
with links to each event's page on its source's site. When moderators turn on
pinning, it also pins that post and unpins the previous day's. Those posts are the only things it writes
anywhere.

Video posts link to YouTube. Once someone follows such a link they are on YouTube, and
Google's own terms and privacy policy govern what happens there.

## Data retention

Stored video metadata expires automatically **30 days** after it is recorded, in line
with the YouTube API Services Developer Policies' limit on retaining non-authorized
data. The events digest stores no event data to expire. All of an installation's stored
data is removed when the app is uninstalled.

Because no personal data is stored, there is no personal data to request deletion of. If
you believe otherwise, contact us using the details below and we will investigate and
respond.

## Changes

If this policy changes, the updated version will be published at this address and the
date above will change.

## Contact

Questions, complaints, or reports about this app or this policy:

- **Reddit:** modmail to [r/BastropTX](https://www.reddit.com/r/BastropTX)
- **GitHub:** open an issue at
  [github.com/Symphon-y/bastrop-news](https://github.com/Symphon-y/bastrop-news/issues)
