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

// the ledger does not know this tweet, so it must be recently due or it
// would be expired rather than published: generate it with a time an hour ago
// (generated files are gitignored)
const fs = require("fs");
const SCHEDULED = new Date(Date.now() - 60 * 60 * 1000);
SCHEDULED.setUTCMilliseconds(0);
fs.writeFileSync(
  path.join(__dirname, "tweets", "failing.tweet"),
  `---\nretweet: https://x.com/m2rg/status/0000000000000000001\nschedule: ${SCHEDULED.toISOString()}\n---\n\nQuote it\n`
);

// MOCK
nock("https://api.github.com", {
  reqheaders: { authorization: "token secret123" },
})
  .get(LEDGER)
  .query({ ref: "published-tweets" })
  .reply(404)
  .get("/repos/twitter-together/action/git/ref/heads%2Fpublished-tweets")
  .reply(200, { ref: "refs/heads/published-tweets" })
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/failing.tweet"];
    tap.equal(entry.status, "failed");
    tap.equal(
      entry.error,
      "Request failed with code 403: You can only reply to or quote posts where you are mentioned or are the author."
    );
    tap.equal(
      entry.record,
      "https://github.com/twitter-together/action/runs/77"
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

// publication records attach to the commit that added the file; the test
// folders are not their own git repositories, so stub git out
const git = require("../../lib/schedule/git");
git.addingCommit = () => "add0000000000000000000000000000000000000";
git.lastChange = () => "2020-01-03T00:00:00Z";

// publication records (check runs)
nock("https://api.github.com", {
  reqheaders: { authorization: "token secret123" },
})
  .get(
    "/repos/twitter-together/action/commits/add0000000000000000000000000000000000000/check-runs"
  )
  .query(true)
  .reply(200, { total_count: 0, check_runs: [] })
  .post("/repos/twitter-together/action/check-runs", (body) => {
    tap.equal(body.name, "scheduled tweet: tweets/failing.tweet");
    tap.equal(body.head_sha, "add0000000000000000000000000000000000000");
    tap.equal(body.status, "in_progress");
    return true;
  })
  .reply(201, {
    id: 77,
    html_url: "https://github.com/twitter-together/action/runs/77",
  })
  .patch("/repos/twitter-together/action/check-runs/77", (body) => {
    tap.equal(body.status, "completed");
    tap.equal(body.conclusion, "failure");
    tap.match(body.output.summary, /You can only reply to or quote posts/);
    return true;
  })
  .reply(200, { id: 77 });

require("../../lib");
