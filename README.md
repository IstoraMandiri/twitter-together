<p align="center">
  <a href="https://github.com/twitter-together/action/issues/16"><img src="assets/logo.png" width="150" alt="twitter together logo" /></a>
</p>

<h1 align="center">Twitter, together!</h1>

<p align="center">
  <a href="https://action-badges.now.sh" rel="nofollow"><img alt="Build Status" src="https://github.com/twitter-together/action/workflows/Test/badge.svg"></a>
  <a href="https://github.com/twitter-together/action/blob/80c8aab34382347120e22501c2e44f30a7a62174/package.json#L8" rel="nofollow"><img alt="Coverage" src="https://img.shields.io/badge/coverage-100%25-green.svg"></a>
</p>

For Open Source or event maintainers that share a project twitter account, `twitter-together` is a GitHub Action that utilizes text files to publish tweets from a GitHub repository. Rather than tweeting directly, GitHub’s pull request review process encourages more collaboration, Twitter activity and editorial contributions by enabling everyone to submit tweet drafts to a project.

<p align="center">
  <img src="assets/demo.gif" alt="Screencast demonstrating twitter-together" />
</p>

<!-- toc -->

- [Try it](#try-it)
- [Twitter API compatibility](#twitter-api-compatibility)
- [Setup](#setup)
- [Contribute](#contribute)
- [How it works](#how-it-works)
  - [The `push` event](#the-push-event)
  - [The `pull_request` event](#the-pull_request-event)
  - [Advanced tweeting](#advanced-tweeting)
- [Motivation](#motivation)
- [License](#license)

<!-- tocstop -->

## Try it

You can submit a tweet to this repository to see the magic happen. Please follow the instructions at [tweets/README.md](tweets/README.md) and mention your own twitter username to the tweet. This repository is setup to tweet from [https://twitter.com/commit2tweet](https://twitter.com/commit2tweet).

## Twitter API compatibility

Twitter, Together uses the v2 Twitter API for most functionality.
It makes use of the v1 API for media uploads, as there is no v2 equivalent endpoint.

Essentials level Twitter access should grant access to all endpoints Twitter, Together uses.

## Setup

Unless you wish to contribute to this project, you don't need to fork this repository.
Instead, you can make use of this GitHub Action from the comfort of your own repository (either a new one, or one you already have) by creating a GitHub Actions workflow following these steps:

1. [Create a Twitter app](docs/01-create-twitter-app.md) with your shared Twitter account and store the credentials as `TWITTER_API_KEY`, `TWITTER_API_SECRET_KEY`, `TWITTER_ACCESS_TOKEN` and `TWITTER_ACCESS_TOKEN_SECRET` in your repository’s secrets settings.
2. [Create a `.github/workflows/twitter-together.yml` file](docs/02-create-twitter-together-workflow.md) with the content below. Make sure to replace `'main'` if you changed your repository's default branch.

```yml
on: [push, pull_request]
name: Twitter, together!
jobs:
  preview:
    name: Preview
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: checkout pull request
        uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - name: Validate Tweets
        uses: twitter-together/action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  tweet:
    name: Tweet
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: checkout main
        uses: actions/checkout@v3
      - name: Tweet
        uses: twitter-together/action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET_KEY: ${{ secrets.TWITTER_API_SECRET_KEY }}
```

TODO: CONFIRM

If you wish to have this action create preview comments in the PR thread, you can use the following config.

Note that `pull_request_target` events have elevated permissions, so if you are using this config, you should configure your repository to only trigger actions that are trusted. You can do this in [various](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/) ways, including preventing outside contributors from triggering actions automatically, and requiring only allowing actions from Verified Creators in your repository Settings -> Actions -> General.

You can also securely enable PR comments only for local branch commits, using the `pull_request` events with an `ENABLE_COMMENTS: 1` env variable, but comments will not be created for PRs from forks.

```yml
# enable comments, but beware of security implications
on: [push, pull_request_target]
name: Twitter, together!
jobs:
  preview:
    name: Preview
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request_target'
    permissions:
      pull-requests: write
    steps:
      - name: checkout pull request
        uses: actions/checkout@v3
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - name: Validate Tweets
        uses: twitter-together/action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

3. After creating or updating `.github/workflows/twitter-together.yml` in your repository’s default branch, a pull request will be created with further instructions.

Happy collaborative tweeting!

## Contribute

All contributions welcome!

Especially if you try `twitter-together` for the first time, I’d love to hear if you ran into any trouble. I greatly appreciate any documentation improvements to make things more clear, I am not a native English speaker myself.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more information on how to contribute. You can also [just say thanks](https://github.com/twitter-together/action/issues/new?labels=feature&template=04_thanks.md) 😊

## Thanks to all contributors 💐

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://jasonet.co"><img src="https://avatars1.githubusercontent.com/u/10660468?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jason Etcovitch</b></sub></a><br /><a href="#design-JasonEtco" title="Design">🎨</a> <a href="https://github.com/twitter-together/action/commits?author=JasonEtco" title="Documentation">📖</a> <a href="https://github.com/twitter-together/action/commits?author=JasonEtco" title="Code">💻</a></td>
      <td align="center"><a href="http://erons.me"><img src="https://avatars0.githubusercontent.com/u/37238033?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Erons</b></sub></a><br /><a href="https://github.com/twitter-together/action/commits?author=Eronmmer" title="Documentation">📖</a></td>
      <td align="center"><a href="https://mattcowley.co.uk/"><img src="https://avatars.githubusercontent.com/u/12371363?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Matt Cowley</b></sub></a><br /><a href="https://github.com/twitter-together/action/commits?author=MattIPv4" title="Code">💻</a> <a href="https://github.com/twitter-together/action/commits?author=MattIPv4" title="Documentation">📖</a> <a href="https://github.com/twitter-together/action/commits?author=MattIPv4" title="Tests">⚠️</a> <a href="#ideas-MattIPv4" title="Ideas, Planning, & Feedback">🤔</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## How it works

`twitter-together` is using two workflows

1. `push` event to publish new tweets
2. `pull_request` event to validate and preview new tweets

_(Tweets can also be invoked locally by calling the script with the `--file` flag, which can be useful for development. E.g. `TWITTER_ACCESS_TOKEN=... node lib/index.js --file tweets/hello-world.tweet`)_

### The `push` event

When triggered by the `push` event, the script looks for added `*.tweet` files in the `tweets/` folder or subfolders. If there are any, a tweet for each added tweet file is published.

If there is no `tweets/` subfolder, the script opens a pull request creating the folder with further instructions.

### The `pull_request` event

For the `pull_request` event, the script handles only `opened` and `synchronize` actions. It looks for new `*.tweet` files in the `tweets/` folder or subfolders. If there are any, the length of each tweet is validated. If one is too long, a failed check run with an explanation is created. If all tweets are valid, a check run with a preview of all tweets is created.

### Advanced tweeting

Beyond tweeting out plain-text tweets, twitter-together also supports creating polls, replying to other tweets, retweeting or quote-retweeting other tweets, threading a chain of tweets, and adding images to tweets.

Polls can be included directly in the body of tweet like so:

```tweet
What is your favorite color?

( ) Red
( ) Blue
( ) Green
```

All other advanced tweeting features are supporting through defining YAML frontmatter in the tweet file.
Some frontmatter items can be combined together, where Twitter functionality supports it.

A poll can also be defined in frontmatter, rather than in the tweet body, like so:

```tweet
---
poll:
  - Red
  - Blue
  - Green
---

What is your favorite color?
```

To reply to another post, include the `reply` frontmatter item with the post link that you wish to reply to:

```tweet
---
reply: https://x.com/gr2m/status/1409601188362809349
---

@gr2m I love your work!
```

If you want to quote another post, include the `retweet` frontmatter item with the post link that you wish to quote.
If you'd prefer to just repost without quoting, don't provide a tweet body after the frontmatter.

```tweet
---
retweet: https://x.com/gr2m/status/1409601188362809349
---

twitter-together is awesome!
```

Post links are parsed leniently: `x.com`, `twitter.com` and `mobile.twitter.com` links are accepted, with or without
tracking parameters (`?s=20`) or fragments (`#m`). A bare post id also works, but must be quoted (`retweet: "1409601188362809349"`)
so YAML does not turn it into a number.

> **X restricts replies and quotes.** The X API only allows an account to reply to or quote posts that it wrote
> itself, or that mention it. Attempting anything else fails with
> `You can only reply to or quote posts where you are mentioned or are the author.`
> Plain reposts (a `retweet` with no body) are not affected.
>
> Set the `TWITTER_ACCOUNT` environment variable (the handle of the posting account, without `@`) on the
> `pull_request` / `pull_request_target` job to have the preview verify that referenced posts exist and satisfy
> this rule before the pull request is merged. This uses X's public syndication endpoint and does not need API credentials.

### Scheduled tweets

A tweet with a `schedule` front matter item is **not** published when its pull request is merged.
Instead it is published by a separate workflow once the scheduled time has passed.

```tweet
---
schedule: 2030-01-02T03:04:00Z
---

Future news!
```

Add a second workflow to the repository to publish them:

```yml
name: Publish scheduled tweets
on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: publish-scheduled-tweets
  cancel-in-progress: false
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: twitter-together/action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TWITTER_ACCESS_TOKEN: ${{ secrets.TWITTER_ACCESS_TOKEN }}
          TWITTER_ACCESS_TOKEN_SECRET: ${{ secrets.TWITTER_ACCESS_TOKEN_SECRET }}
          TWITTER_API_KEY: ${{ secrets.TWITTER_API_KEY }}
          TWITTER_API_SECRET_KEY: ${{ secrets.TWITTER_API_SECRET_KEY }}
```

This needs no credentials beyond the ones the repository already has. Timing is limited by the cron
interval, and GitHub often delays scheduled runs, so treat the scheduled time as "not before" rather
than exact. `workflow_dispatch` lets a maintainer publish due tweets without waiting for the next run.

Which tweets have been published is recorded in `.github/published-tweets.json` on a `published-tweets`
branch, committed by the workflow. It lives on its own branch because a protected default branch (pull
requests only) would block the workflow from writing to it; the branch is created automatically on first
use. Each tweet is claimed in that file _before_ it is sent, so a run that dies midway can never
publish the same tweet twice. The cost of that guarantee is that an interrupted run may leave a tweet
stuck as `"publishing"`; remove its entry from the file to release it. A tweet X rejects is recorded
as `"failed"` with the reason, and is not retried until its entry is removed.

The ledger path and branch can be changed with the `SCHEDULE_LEDGER_PATH` and `SCHEDULE_LEDGER_BRANCH` environment variables.

To include media items with your tweet, include the `media` frontmatter item as an array with each item having a `file` property and an optional `alt` property.
The `file` property should be the name of a file within the `media` directory of your repository (same level as the `tweets` directory).

_(Note: Although alt text can be set in frontmatter, it is not yet actually passed to Twitter due to library limitations)._

```tweet
---
media:
  - file: cat.jpg
    alt: A cat
  - file: dog.jpg
    alt: A dog
---

Here are some cute animals!
```

To thread a chain of tweets, use `---` to delimit each tweet in the file. You can optionally set `threadDelimiter` in the frontmatter to change the delimiter for the next tweet in the thread. Each tweet in a thread supports its own frontmatter.

```tweet
---
media:
  - file: cat.jpg
    alt: A cat
  - file: dog.jpg
    alt: A dog
---

Here are some cute animals!

---
---
poll:
  - Cat
  - Dog
---

Which one is cuter?
```

## Motivation

I think we can make Open Source more inclusive to people with more diverse interests by making it easier to contribute other things than code and documentation. I see a particularly big opportunity to be more welcoming towards editorial contributions by creating tools using GitHub’s Actions, Apps and custom user interfaces backed by GitHub’s REST & GraphQL APIs.

I’ve plenty more ideas that I’d like to build out. Please ping me on twitter if you’d like to chat: [@gr2m](https://twitter.com/gr2m).

## License

[MIT](LICENSE)
