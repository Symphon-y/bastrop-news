# Privacy Policy — bastrop-news

_Last updated: 2026-08-14_

bastrop-news is a non-commercial Reddit app that posts new videos from a fixed list of
YouTube channels to the subreddit it is installed in. This policy describes exactly what
it accesses, stores, and shares.

**This app uses YouTube API Services.** By using it you are also subject to the
[Google Privacy Policy](http://www.google.com/policies/privacy) and the
[YouTube Terms of Service](https://www.youtube.com/t/terms).

## Information this app accesses

- **Public YouTube video metadata** — video ID, title, description, publish date, and
  URL — for uploads on a small, fixed list of channels, retrieved through the YouTube
  Data API v3. This is information those channels have already published publicly.
- **No YouTube account data.** The app authenticates with an API key, not a user
  account. It cannot see any viewer's watch history, subscriptions, or any other
  personal YouTube data, and it never asks anyone to sign in to Google.
- **No Reddit user data.** The app does not read profiles, comment history, votes,
  private messages, or any other account data belonging to any redditor.

Because the app never accesses authorized user data, there is nothing for a user to
revoke. Nobody grants it access to a Google account.

## Information this app stores

In storage private to each installation, the app keeps: video ID, title, description,
URL, publish date, and whether that video has been posted. This exists for two reasons
only — to avoid posting the same video twice, and to pace how often the app posts.

**No personal information is stored.** No information about any redditor, viewer, or
channel owner is collected, stored, or profiled. The app stores nothing on or from
anyone's device — it has no client-side component, sets no cookies, and runs no scripts
in anyone's browser.

## How this app uses and shares information

Stored video metadata is used solely to decide whether a video has already been posted
and which one to post next. It is not shared with anyone. No data is sold, and none is
used to train machine learning models.

The app makes exactly one kind of external request: to `youtube.googleapis.com`, to list
recent uploads for the configured channels. Nothing about any redditor is included in
those requests, because the app never has such information.

No third party serves content or advertisements through this app.

## Information this app publishes

The app submits link posts — a video's title, linking to that video on YouTube — to the
subreddit it is installed in, under the app's own account. That is the only thing it
writes anywhere.

Those posts link to YouTube. Once someone follows such a link they are on YouTube, and
Google's own terms and privacy policy govern what happens there.

## Data retention

Stored video metadata expires automatically **30 days** after it is recorded, in line
with the YouTube API Services Developer Policies' limit on retaining non-authorized
data. All of an installation's stored data is removed when the app is uninstalled.

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
