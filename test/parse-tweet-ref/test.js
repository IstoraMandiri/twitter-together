/**
 * Unit tests for lenient post reference parsing
 */
const tap = require("tap");
const parseTweetId = require("../../lib/common/parse-tweet-id");
const { parseTweetRef, canonicalTweetUrl } = parseTweetId;
const { syndicationToken } = require("../../lib/common/lookup-tweet");
const formatError = require("../../lib/common/format-error");

const valid = {
  "https://twitter.com/gr2m/status/123": ["gr2m", "123"],
  "https://x.com/gr2m/status/123": ["gr2m", "123"],
  "https://X.com/gr2m/status/123/": ["gr2m", "123"],
  "http://www.x.com/gr2m/status/123": ["gr2m", "123"],
  "https://mobile.twitter.com/gr2m/status/123#m": ["gr2m", "123"],
  "https://x.com/gr2m/status/123?s=20&t=abc": ["gr2m", "123"],
  "https://x.com/gr2m/status/123/photo/1": ["gr2m", "123"],
  "https://x.com/gr2m/statuses/123": ["gr2m", "123"],
  "x.com/gr2m/status/123": ["gr2m", "123"],
  "  https://x.com/gr2m/status/123  ": ["gr2m", "123"],
  "https://x.com/i/web/status/123": [null, "123"],
  123: [null, "123"],
};

for (const [input, [username, id]] of Object.entries(valid)) {
  const parsed = parseTweetRef(input);
  tap.equal(parsed.id, id, `id of ${input}`);
  tap.equal(parsed.username, username, `username of ${input}`);
  tap.equal(parsed.url, canonicalTweetUrl(username, id), `url of ${input}`);
  tap.equal(parseTweetId(input), id, `parseTweetId of ${input}`);
}

tap.equal(canonicalTweetUrl("gr2m", "123"), "https://x.com/gr2m/status/123");
tap.equal(canonicalTweetUrl(null, "123"), "https://x.com/i/web/status/123");

const invalid = [
  "spoons",
  "",
  null,
  "https://example.com/gr2m/status/123",
  "https://x.com/gr2m/status/abc",
  "https://x.com/gr2m",
  "https://x.com/gr2m/status/",
  "https://notx.com/gr2m/status/123",
];
for (const input of invalid) {
  tap.throws(
    () => parseTweetRef(input),
    /Invalid tweet reference/,
    `rejects ${JSON.stringify(input)}`
  );
}

// token derivation matches react-tweet for a real post id
tap.equal(syndicationToken("2100681569946231209"), "53bhhkwr1j");

// error formatting
tap.equal(formatError(new Error("boom")), "boom");
tap.equal(formatError("plain"), "plain");
tap.equal(formatError(undefined), "Unknown error");
tap.equal(
  formatError(
    Object.assign(new Error("Request failed with code 403"), {
      data: {
        detail:
          "You can only reply to or quote posts where you are mentioned or are the author.",
        title: "Authorization Error",
      },
    })
  ),
  "Request failed with code 403: You can only reply to or quote posts where you are mentioned or are the author."
);
tap.equal(
  formatError(
    Object.assign(new Error("Request failed with code 400"), {
      data: {
        title: "Bad Request",
        errors: [{ message: "first" }, { message: "second" }],
      },
    })
  ),
  "Request failed with code 400: Bad Request: first: second"
);

// lookup error handling
const nock = require("nock");
const lookupTweet = require("../../lib/common/lookup-tweet");

tap.test("lookupTweet", async (t) => {
  const id = "0000000000000000001";
  const token = syndicationToken(id);

  nock("https://cdn.syndication.twimg.com")
    .get("/tweet-result")
    .query({ id, token })
    .reply(200, "not json");
  await t.rejects(lookupTweet(id), /JSON/, "rejects invalid JSON");

  nock("https://cdn.syndication.twimg.com")
    .get("/tweet-result")
    .query({ id, token })
    .replyWithError("connection reset");
  await t.rejects(
    lookupTweet(id),
    /connection reset/,
    "rejects network errors"
  );

  nock("https://cdn.syndication.twimg.com")
    .get("/tweet-result")
    .query({ id, token })
    .delay(200)
    .reply(200, {});
  await t.rejects(
    lookupTweet(id, { timeout: 20 }),
    /timed out/,
    "rejects on timeout"
  );

  nock("https://cdn.syndication.twimg.com")
    .get("/tweet-result")
    .query({ id, token })
    .reply(200, {
      __typename: "Tweet",
      id_str: id,
      text: "hi @a and @b",
      user: { screen_name: "author" },
      entities: { user_mentions: [{ screen_name: "a" }, { screen_name: "b" }] },
    });
  t.same(await lookupTweet(id), {
    id,
    username: "author",
    text: "hi @a and @b",
    mentions: ["a", "b"],
  });

  nock("https://cdn.syndication.twimg.com")
    .get("/tweet-result")
    .query({ id, token })
    .reply(200, { __typename: "Tweet", user: { screen_name: "author" } });
  t.same(await lookupTweet(id), {
    id,
    username: "author",
    text: "",
    mentions: [],
  });

  t.same(nock.pendingMocks(), []);
});
