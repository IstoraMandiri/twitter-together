/**
 * A tweet X refuses is recorded as failed, with the reason, and the run fails.
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
  .reply(404)
  .get("/repos/twitter-together/action/git/ref/heads%2Fpublished-tweets")
  .reply(200, { ref: "refs/heads/published-tweets" })
  .put(LEDGER)
  .reply(201, { content: { sha: "ledgersha1" } })
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/failing.tweet"];
    tap.equal(entry.status, "failed");
    tap.equal(
      entry.error,
      "Request failed with code 403: You can only reply to or quote posts where you are mentioned or are the author."
    );
    return true;
  })
  .reply(200, { content: { sha: "ledgersha2" } });

nock("https://api.twitter.com")
  .get("/2/users/me")
  .reply(200, { data: { id: "123", name: "gr2m", username: "gr2m" } })
  .post("/2/tweets")
  .reply(403, {
    detail:
      "You can only reply to or quote posts where you are mentioned or are the author.",
    status: 403,
    title: "Authorization Error",
  });

process.on("exit", (code) => {
  tap.equal(code, 1);
  tap.same(nock.pendingMocks(), []);
  process.exitCode = 0;
});

require("../../lib");
