module.exports = parseTweetId;
module.exports.parseTweetRef = parseTweetRef;
module.exports.canonicalTweetUrl = canonicalTweetUrl;

// Accepts the many shapes a post URL can take when copy-pasted:
//   https://x.com/user/status/123
//   https://twitter.com/user/status/123?s=20&t=abc
//   https://mobile.twitter.com/user/status/123#m
//   https://www.x.com/user/status/123/photo/1
//   https://x.com/i/web/status/123
//   123 (a bare post id)
// https://github.com/twitter-together/action/issues/221
const TWEET_URL_REGEX =
  /^(?:https?:\/\/)?(?:(?:www|mobile)\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})(?:\/web)?\/status(?:es)?\/(\d+)(?:\/[^?#]*)?\/?(?:[?#].*)?$/i;
const TWEET_ID_REGEX = /^\d+$/;

function parseTweetRef(tweetRef) {
  const ref = String(tweetRef || "").trim();

  if (TWEET_ID_REGEX.test(ref)) {
    return { id: ref, username: null, url: canonicalTweetUrl(null, ref) };
  }

  const match = ref.match(TWEET_URL_REGEX);
  if (!match) {
    throw new Error(`Invalid tweet reference: ${tweetRef}`);
  }

  const [, username, id] = match;
  // https://x.com/i/web/status/123 does not carry the author
  const author = username.toLowerCase() === "i" ? null : username;
  return { id, username: author, url: canonicalTweetUrl(author, id) };
}

function canonicalTweetUrl(username, id) {
  return `https://x.com/${username || "i/web"}/status/${id}`;
}

function parseTweetId(tweetRef) {
  return parseTweetRef(tweetRef).id;
}
