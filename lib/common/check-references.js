module.exports = checkReferences;

const lookupTweet = require("./lookup-tweet");
const { parseTweetRef } = require("./parse-tweet-id");

/**
 * Verify that the posts referenced by a parsed tweet (reply / retweet / quote)
 * exist, and warn when X's policy for replies and quotes may apply:
 *
 *   "You can only reply to or quote posts where you are mentioned or are the author."
 *   https://api.x.com/2/problems/not-authorized-for-resource
 *
 * Whether X enforces it can't be known in advance, so this never fails the
 * preview. Quotes are not affected: they are published with the post link at
 * the end of the text, which X turns into a quote by itself.
 *
 * @param {object} parsed  result of parseTweetFileContent
 * @param {string} account the handle of the posting account, without "@"
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
async function checkReferences(parsed, account) {
  const errors = [];
  const warnings = [];
  const handle = String(account || "")
    .replace(/^@/, "")
    .toLowerCase();

  let tweet = parsed;
  while (tweet) {
    if (tweet.reply) await check(tweet.reply, "reply");
    if (tweet.retweet)
      await check(tweet.retweet, tweet.text ? "quote" : "retweet");
    tweet = tweet.thread;
  }

  return { errors, warnings };

  async function check(ref, kind) {
    const { id, username } = parseTweetRef(ref);
    let post;
    try {
      post = await lookupTweet(id);
    } catch (error) {
      warnings.push(
        `Could not verify ${ref} (${error.message}). It will be checked again when the tweet is published.`
      );
      return;
    }

    if (!post) {
      errors.push(
        `Referenced post ${ref} could not be found. It may have been deleted, or the account may be protected.`
      );
      return;
    }

    if (username && username.toLowerCase() !== post.username.toLowerCase()) {
      warnings.push(
        `${ref} was written by @${post.username}, not @${username}. The post id is what matters, but double check the link.`
      );
    }

    // quotes are published as a link in the text, which X always accepts
    if (!handle || kind !== "reply") return;

    const author = post.username.toLowerCase();
    const mentioned = post.mentions.some((m) => m.toLowerCase() === handle);
    if (author === handle || mentioned) return;

    warnings.push(
      `X may refuse to let @${account} reply to ${ref} because it was written by @${post.username} and does not mention @${account}. ` +
        "If publishing fails, write a standalone tweet that links to the post instead."
    );
  }
}
