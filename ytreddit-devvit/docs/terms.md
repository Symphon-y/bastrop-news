# Terms & Conditions — ytreddit-devvit

_Last updated: 2026-08-13_

ytreddit-devvit is a small, non-commercial Devvit app that watches a fixed set of
YouTube channels and automatically submits a link post to r/BastropTX when a new,
relevant video is published.

## What the app does

- On a recurring schedule (roughly every 15 minutes), the app checks the YouTube
  Data API v3 for new uploads on a small, fixed list of channels configured by the
  app's developer (see the app's source repository for the current list).
- Videos published more than a configured age window ago are ignored.
- For channels configured with keyword filters, only videos whose title or
  description contain a matching keyword are considered.
- At most one video is posted per check, and posts are spaced at least a configured
  minimum interval apart, regardless of how often the app checks.
- Posts are submitted as plain link posts (title + URL) under this app's account.

## What the app does not do

- It does not read, store, or act on private user data of any kind.
- It does not vote, comment, message, or take moderation actions.
- It does not post to any subreddit other than the one it is installed in.
- It does not use Reddit content to train any machine learning model.
- It does not sell, share, or otherwise commercialize any data it touches.

## Availability

This app is provided as-is, without warranty, for personal/community use. It may be
modified, paused, or discontinued at any time by its developer.

## Contact

Questions about this app can be directed to its developer via r/BastropTX modmail.
