/**
 * Tweets scheduled in the future, and unscheduled tweets, are left alone.
 */

const path = require("path");

const nock = require("nock");
const tap = require("tap");

// SETUP
process.env.GITHUB_EVENT_NAME = "schedule";
process.env.GITHUB_TOKEN = "secret123";
process.env.GITHUB_EVENT_PATH = require.resolve("./event.json");
process.env.GITHUB_REF = "refs/heads/main";
process.env.GITHUB_WORKSPACE = path.dirname(process.env.GITHUB_EVENT_PATH);
process.env.TWITTER_API_KEY = "key123";
process.env.TWITTER_API_SECRET_KEY = "keysecret123";
process.env.TWITTER_ACCESS_TOKEN = "token123";
process.env.TWITTER_ACCESS_TOKEN_SECRET = "tokensecret123";

// set other env variables so action-toolkit is happy
process.env.GITHUB_WORKFLOW = "";
process.env.GITHUB_ACTION = "twitter-together";
process.env.GITHUB_ACTOR = "";
process.env.GITHUB_REPOSITORY = "";
process.env.GITHUB_SHA = "";

const LEDGER =
  "/repos/twitter-together/action/contents/.github%2Fpublished-tweets.json";
const decode = (content) =>
  JSON.parse(Buffer.from(content, "base64").toString("utf8"));

// MOCK
nock("https://api.github.com", {
  reqheaders: { authorization: "token secret123" },
})
  .get(LEDGER)
  .query({ ref: "published-tweets" })
  .reply(200, {
    sha: "ledgersha0",
    content: Buffer.from("{}", "utf8").toString("base64"),
  })
  // the future tweet is not in the ledger yet: queued, not published
  .put(LEDGER, (body) => {
    const entries = decode(body.content);
    tap.same(Object.keys(entries), ["tweets/future.tweet"]);
    tap.equal(entries["tweets/future.tweet"].status, "pending");
    tap.equal(
      entries["tweets/future.tweet"].scheduled,
      "2099-01-02T03:04:00.000Z"
    );
    tap.equal(body.sha, "ledgersha0");
    tap.match(body.message, /Queue 1 scheduled tweet/);
    return true;
  })
  .reply(200, { content: { sha: "ledgersha1" } });

// no twitter calls are expected

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);

  // for some reason, tap fails with "Suites:   1 failed" if we don't exit explicitly
  process.exit(0);
});

require("../../lib");
