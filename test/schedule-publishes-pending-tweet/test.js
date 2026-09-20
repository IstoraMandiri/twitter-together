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

  // claim
  .put(LEDGER, (body) => {
    const entries = decode(body.content);
    tap.same(Object.keys(entries), ["tweets/scheduled.tweet"]);
    tap.equal(entries["tweets/scheduled.tweet"].status, "publishing");
    tap.equal(
      entries["tweets/scheduled.tweet"].queuedAt,
      "2019-12-01T00:00:00.000Z",
      "keeps queue info"
    );
    tap.equal(body.sha, "ledgersha0");
    tap.equal(
      entries["tweets/scheduled.tweet"].scheduled,
      "2020-01-02T03:04:00.000Z"
    );
    tap.equal(body.branch, "published-tweets");
    tap.match(body.message, /Claim 1 scheduled tweet/);
    tap.match(body.message, /\[skip ci\]/);
    return true;
  })
  .reply(201, { content: { sha: "ledgersha1" } })

  // record the result
  .put(LEDGER, (body) => {
    const entry = decode(body.content)["tweets/scheduled.tweet"];
    tap.equal(entry.status, "published");
    tap.same(entry.urls, ["https://x.com/gr2m/status/0000000000000000002"]);
    tap.equal(body.sha, "ledgersha1");
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

require("../../lib");
