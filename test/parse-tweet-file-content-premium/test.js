/**
 * Unit tests for the length limit, which X_PREMIUM raises to 25,000 characters
 */
const tap = require("tap");
const parseTweetFileContent = require("../../lib/common/parse-tweet-file-content");
const { maxTweetLength } = parseTweetFileContent;

tap.equal(maxTweetLength(undefined), 280);
tap.equal(maxTweetLength(""), 280);
tap.equal(maxTweetLength("false"), 280);
tap.equal(maxTweetLength("true"), 25000);
tap.equal(maxTweetLength("TRUE "), 25000);
tap.equal(maxTweetLength("1"), 25000);

const long = "a".repeat(1000);

delete process.env.X_PREMIUM;
tap.throws(
  () => parseTweetFileContent(long, __dirname),
  /exceeds maximum length of 280 characters by 720 characters/
);

process.env.X_PREMIUM = "true";
tap.equal(parseTweetFileContent(long, __dirname).weightedLength, 1000);
// emoji count twice, as in X's counting
tap.equal(
  parseTweetFileContent("😀".repeat(12500), __dirname).weightedLength,
  25000
);
tap.throws(
  () => parseTweetFileContent("a".repeat(25001), __dirname),
  /exceeds maximum length of 25000 characters by 1 characters/
);
// quotes and threads use the same limit
tap.equal(
  parseTweetFileContent(
    `---\nretweet: https://x.com/m2rg/status/123\n---\n\n${long}`,
    __dirname
  ).text,
  long
);
tap.equal(
  parseTweetFileContent(`First\n\n---\n\n${long}`, __dirname).thread.text,
  long
);
delete process.env.X_PREMIUM;
