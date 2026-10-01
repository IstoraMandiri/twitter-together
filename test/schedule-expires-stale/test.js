/**
 * A scheduled tweet the ledger does not know about, long past its time, is marked expired instead of published.
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
    content: Buffer.from(JSON.stringify({}), "utf8").toString("base64"),
  })
  .put(LEDGER, (body) => {
    const entries = decode(body.content);
    tap.equal(entries["tweets/stale.tweet"].status, "expired");
    tap.match(body.message, /Queue 1 scheduled tweet/);
    return true;
  })
  .reply(200, { content: { sha: "ledgersha1" } });

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
  process.exit(0);
});

// publication records attach to the commit that added the file; the test
// folders are not their own git repositories, so stub git out
const git = require("../../lib/schedule/git");
git.addingCommit = () => "add0000000000000000000000000000000000000";
git.lastChange = () => "2020-01-03T00:00:00Z";

require("../../lib");
