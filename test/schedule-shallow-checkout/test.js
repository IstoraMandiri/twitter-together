/**
 * Without git history the adding commit is unknown: the tweet is not published and the run fails.
 */

const path = require("path");

const nock = require("nock");
const tap = require("tap");

// two assertions in the ledger write, two at exit
tap.plan(4);

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
          status: "pending",
          scheduled: "2020-01-02T03:04:00.000Z",
        },
      }),
      "utf8"
    ).toString("base64"),
  })
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/scheduled.tweet"];
    tap.equal(entry.status, "failed");
    tap.match(entry.error, /fetch-depth: 0/);
    return true;
  })
  .reply(200, { content: { sha: "ledgersha1" } });

process.on("exit", (code) => {
  tap.equal(code, 1);
  tap.same(nock.pendingMocks(), []);
  process.exitCode = 0;
});

const git = require("../../lib/schedule/git");
git.addingCommit = () => null;

require("../../lib");
