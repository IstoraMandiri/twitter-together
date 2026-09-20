module.exports = checkReferences;

const lookupTweet = require("./lookup-tweet");
const { parseTweetRef } = require("./parse-tweet-id");

/**
 * Verify that the posts referenced by a parsed tweet (reply / retweet / quote)
 * exist, and that X's policy for replies and quotes is satisfied:
 *
 *   "You can only reply to or quote posts where you are mentioned or are the author."
 *   https://api.x.com/2/problems/not-authorized-for-resource
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

    if (!handle || kind === "retweet") return;

    const author = post.username.toLowerCase();
    const mentioned = post.mentions.some((m) => m.toLowerCase() === handle);
    if (author === handle || mentioned) return;

    const verb = kind === "reply" ? "reply to" : "quote";
    errors.push(
      `X only allows @${account} to ${verb} posts that were written by @${account} or that mention @${account}. ` +
        `${ref} was written by @${post.username} and does not mention @${account}. ` +
        (kind === "quote"
          ? "Remove the text to make this a plain retweet, or write a standalone tweet that links to the post instead."
          : "Write a standalone tweet that links to the post instead.")
    );
  }
}
