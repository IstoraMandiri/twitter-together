/**
 * A tweet whose publication failed is retried once its file has been changed after the failure.
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
    content: Buffer.from(
      JSON.stringify({
        "tweets/scheduled.tweet": {
          status: "failed",
          failedAt: "2020-01-02T03:10:00.000Z",
          scheduled: "2020-01-02T03:04:00.000Z",
        },
      }),
      "utf8"
    ).toString("base64"),
  })
  .put(LEDGER, (body) => {
    const entries = decode(body.content);
    tap.equal(entries["tweets/scheduled.tweet"].status, "published");
    return true;
  })
  .reply(200, { content: { sha: "ledgersha1" } });

// publication records (check runs)
nock("https://api.github.com", {
  reqheaders: { authorization: "token secret123" },
})
  .get(
    "/repos/twitter-together/action/commits/add0000000000000000000000000000000000000/check-runs"
  )
  .query(true)
  .reply(200, {
    total_count: 0,
    check_runs: [
      {
        id: 5,
        name: "scheduled tweet: tweets/scheduled.tweet",
        status: "completed",
        conclusion: "failure",
        completed_at: "2020-01-02T03:10:00Z",
        html_url: "https://github.com/twitter-together/action/runs/5",
      },
    ],
  })
  .post("/repos/twitter-together/action/check-runs", (body) => {
    tap.equal(body.name, "scheduled tweet: tweets/scheduled.tweet");
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
    tap.equal(body.conclusion, "success");
    return true;
  })
  .reply(200, { id: 77 });

nock("https://api.twitter.com")
  .get("/2/users/me")
  .reply(200, { data: { id: "123", name: "gr2m", username: "gr2m" } })
  .post("/2/tweets")
  .reply(201, { data: { id: "0000000000000000002", text: "hi" } });

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
  process.exit(0);
});

// publication records attach to the commit that added the file; the test
// folders are not their own git repositories, so stub git out
const git = require("../../lib/schedule/git");
git.addingCommit = () => "add0000000000000000000000000000000000000";
git.lastChange = () => "2020-01-05T00:00:00Z";

require("../../lib");
