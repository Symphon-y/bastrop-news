# Terms and Conditions — bastrop-news

_Last updated: 2026-08-14_

bastrop-news is a non-commercial Reddit app that watches a fixed set of YouTube channels
and submits a link post to the subreddit it is installed in when a new, relevant video is
published. By installing or using this app you agree to these terms.

## YouTube

This app uses YouTube API Services to find new videos. **By using this app you are also
agreeing to be bound by the [YouTube Terms of Service](https://www.youtube.com/t/terms).**
Google's handling of your information is described in the
[Google Privacy Policy](http://www.google.com/policies/privacy).

All video content the app links to is hosted by YouTube and belongs to the channel that
published it. This app publishes no video content of its own; it links to the source.

## What the app does

- On a recurring schedule, roughly every 15 minutes, it checks the YouTube Data API v3
  for new uploads on a small, fixed list of channels. The current list is in
  `src/server/channelsConfig.ts` in the app's public source repository.
- Videos published longer ago than a configured age window are ignored.
- For channels configured with keyword filters, a video is considered only if its title
  or description contains a matching keyword.
- At most one video is posted per check, and posts are spaced at least a configured
  minimum interval apart regardless of how often the app checks.
- Posts are plain link posts — the video's title, linking to the video — submitted under
  the app's own account.

## What the app does not do

- It does not read, store, or act on private user data of any kind.
- It does not post, comment, vote, or subscribe on behalf of any redditor. Every post is
  made by the app's own account.
- It does not vote, comment, message, or take moderation actions at all.
- It does not post to any subreddit other than the one it is installed in.
- It does not use Reddit or YouTube content to train any machine learning model.
- It does not modify, summarize, or generate content. A post is the video's own title
  and its URL.
- It does not sell, share, or otherwise commercialize any data it touches.

## Moderator control

The app posts only where a moderator has installed it, and a moderator can uninstall it
at any time to stop it completely. Posts it creates are ordinary Reddit posts and can be
removed, locked, or flaired by moderators like any other. The app does not attempt to
detect, resist, or re-create removed posts.

## Availability

This app is provided as-is and without warranty, for community use. It may be modified,
paused, or discontinued at any time. Availability also depends on the YouTube Data API
and on Reddit's platform, neither of which this app controls.

## Contact

Questions, complaints, or reports about this app:

- **Reddit:** modmail to [r/BastropTX](https://www.reddit.com/r/BastropTX)
- **GitHub:** open an issue at
  [github.com/Symphon-y/bastrop-news](https://github.com/Symphon-y/bastrop-news/issues)
