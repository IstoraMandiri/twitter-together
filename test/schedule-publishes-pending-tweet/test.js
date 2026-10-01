/**
 * A tweet queued as "pending" on merge is claimed, published, and recorded.
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
  // queued on merge
  .get(LEDGER)
  .query({ ref: "published-tweets" })
  .reply(200, {
    sha: "ledgersha0",
    content: Buffer.from(
      JSON.stringify({
        "tweets/scheduled.tweet": {
          status: "pending",
          scheduled: "2020-01-02T03:04:00.000Z",
          queuedAt: "2019-12-01T00:00:00.000Z",
        },
      }),
      "utf8"
    ).toString("base64"),
  })

  // record the result
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/scheduled.tweet"];
    tap.equal(entry.status, "published");
    tap.same(entry.urls, ["https://x.com/gr2m/status/0000000000000000002"]);
    tap.equal(body.sha, "ledgersha0");
    tap.equal(entry.queuedAt, "2019-12-01T00:00:00.000Z", "keeps queue info");
    tap.match(body.message, /Publish 1 scheduled tweet/);
    return true;
  })
  .reply(200, { content: { sha: "ledgersha2" } });

nock("https://api.twitter.com")
  .get("/2/users/me")
  .reply(200, { data: { id: "123", name: "gr2m", username: "gr2m" } })
  .post("/2/tweets", (body) => {
    tap.equal(body.text, "Scheduled hello!");
    return true;
  })
  .reply(201, {
    data: { id: "0000000000000000002", text: "Scheduled hello!" },
  });

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
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

require("../../lib");
