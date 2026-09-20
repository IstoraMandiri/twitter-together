/**
 * A merged tweet with a `schedule` is not published here; the scheduled
 * workflow publishes it when it is due.
 */

const path = require("path");

const nock = require("nock");
const tap = require("tap");

// SETUP
process.env.GITHUB_EVENT_NAME = "push";
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

// MOCK
nock("https://api.github.com", {
  reqheaders: {
    authorization: "token secret123",
  },
})
  // get changed files
  .get(
    "/repos/twitter-together/action/compare/0000000000000000000000000000000000000001...0000000000000000000000000000000000000002"
  )
  .reply(200, {
    files: [
      {
        status: "added",
        filename: "tweets/scheduled.tweet",
      },
    ],
  })

  // queue in the ledger
  .get(
    "/repos/twitter-together/action/contents/.github%2Fpublished-tweets.json"
  )
  .query({ ref: "main" })
  .reply(404)
  .put(
    "/repos/twitter-together/action/contents/.github%2Fpublished-tweets.json",
    (body) => {
      const entries = JSON.parse(
        Buffer.from(body.content, "base64").toString("utf8")
      );
      tap.equal(entries["tweets/scheduled.tweet"].status, "pending");
      tap.equal(
        entries["tweets/scheduled.tweet"].scheduled,
        "2030-01-02T03:04:00.000Z"
      );
      tap.match(body.message, /Queue 1 scheduled tweet/);
      return true;
    }
  )
  .reply(201, { content: { sha: "ledgersha1" } })

  // post comment
  .post(
    "/repos/twitter-together/action/commits/0000000000000000000000000000000000000002/comments",
    (body) => {
      tap.equal(
        body.body,
        "Scheduled, will be published automatically when due:\n\n- tweets/scheduled.tweet (2030-01-02T03:04:00.000Z)"
      );
      return true;
    }
  )
  .reply(201);

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
});

require("../../lib");
