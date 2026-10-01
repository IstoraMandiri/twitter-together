/**
 * Unit tests for quote tweets, which are published with the quoted post link
 * appended to the text
 */
const tap = require("tap");
const parseTweetFileContent = require("../../lib/common/parse-tweet-file-content");
const { quoteText } = parseTweetFileContent;

const URL = "https://x.com/m2rg/status/123";
const quote = (text) => `---\nretweet: ${URL}\n---\n\n${text}`;

tap.equal(quoteText("Hi", URL), `Hi\n\n${URL}`);

const parsed = parseTweetFileContent(quote("Smart thinking!"), __dirname);
tap.equal(parsed.text, "Smart thinking!");
tap.equal(parsed.retweet, URL);

// the link counts as 23 characters, plus two newlines
tap.equal(
  parseTweetFileContent(quote("a".repeat(255)), __dirname).weightedLength,
  280
);
tap.throws(
  () => parseTweetFileContent(quote("a".repeat(256)), __dirname),
  /exceeds maximum length of 280 characters by 1 characters/
);
// without a quote the full 280 characters are available
tap.equal(
  parseTweetFileContent("a".repeat(280), __dirname).weightedLength,
  280
);

// other links would compete with the quoted post
for (const text of [
  "See https://example.com",
  "See ethereumclassic.org",
  `Again ${URL}`,
]) {
  tap.throws(
    () => parseTweetFileContent(quote(text), __dirname),
    /A quote tweet cannot contain other links/,
    text
  );
}
// links are fine in plain tweets and replies
parseTweetFileContent("See https://example.com", __dirname);
parseTweetFileContent(
  `---\nreply: ${URL}\n---\n\nSee https://example.com`,
  __dirname
);
