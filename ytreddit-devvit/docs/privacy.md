# Privacy Policy — ytreddit-devvit

_Last updated: 2026-08-13_

## Data this app reads

- Public metadata (title, description, publish date, video ID) for uploads on a
  small, fixed list of YouTube channels, via the official YouTube Data API v3.
  This is public information already published by those channels; no YouTube
  account data or private information is accessed.
- No Reddit user data is read. The app does not inspect user profiles, comment
  history, votes, or any other Reddit account data.

## Data this app stores

- The app stores, in its own Redis-backed storage (private to this installation):
  video ID, title, description, URL, publish date, and whether the video has been
  posted yet. This is used solely to avoid posting the same video twice and to
  pace how often the app posts.
- No personal data, and no data about Reddit users, is stored.

## Data this app writes

- The app submits link posts (title + URL) to the subreddit it is installed in,
  under this app's own account. That's the only write action it performs.

## Third parties

- The YouTube Data API v3 (operated by Google) is called to check for new videos.
  Only public channel/video metadata is requested; no personal data is sent to
  Google beyond the API request itself.
- No data is shared with any other third party.

## Data retention

- Video metadata is retained only as long as needed to prevent duplicate posts.
  It is scoped to this app's installation and is removed if the app is
  uninstalled from the subreddit.

## Contact

Questions about this policy can be directed to the app's developer via r/BastropTX
modmail.
