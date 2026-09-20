/**
 * A due scheduled tweet is claimed (check run), published, and recorded
 * (check run completed, index written; the ledger branch is created first).
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
  path.join(__dirname, "tweets", "scheduled.tweet"),
  `---\nschedule: ${SCHEDULED.toISOString()}\n---\n\nScheduled hello!\n`
);

// MOCK
nock("https://api.github.com", {
  reqheaders: { authorization: "token secret123" },
})
  // no ledger branch yet: it is created as an orphan holding an empty ledger
  .get(LEDGER)
  .query({ ref: "published-tweets" })
  .reply(404)
  .get("/repos/twitter-together/action/git/ref/heads%2Fpublished-tweets")
  .reply(404)
  .post("/repos/twitter-together/action/git/blobs", (body) => {
    tap.equal(body.content, "{}\n");
    return true;
  })
  .reply(201, { sha: "blobsha" })
  .post("/repos/twitter-together/action/git/trees", (body) => {
    tap.same(body.tree, [
      {
        path: ".github/published-tweets.json",
        mode: "100644",
        type: "blob",
        sha: "blobsha",
      },
    ]);
    return true;
  })
  .reply(201, { sha: "treesha" })
  .post("/repos/twitter-together/action/git/commits", (body) => {
    tap.equal(body.tree, "treesha");
    tap.same(body.parents, []);
    return true;
  })
  .reply(201, { sha: "commitsha" })
  .post("/repos/twitter-together/action/git/refs", (body) => {
    tap.equal(body.ref, "refs/heads/published-tweets");
    tap.equal(body.sha, "commitsha");
    return true;
  })
  .reply(201)

  // record the result
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/scheduled.tweet"];
    tap.equal(entry.status, "published");
    tap.same(entry.urls, ["https://x.com/gr2m/status/0000000000000000002"]);
    tap.equal(
      entry.record,
      "https://github.com/twitter-together/action/runs/77"
    );
    tap.equal(body.sha, "blobsha", "updates the file created with the branch");
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
    tap.match(body.output.summary, /x\.com\/gr2m\/status/);
    return true;
  })
  .reply(200, { id: 77 });

require("../../lib");
