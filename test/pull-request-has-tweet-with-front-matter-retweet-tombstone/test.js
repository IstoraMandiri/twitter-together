/**
 * Generated for the etc fork: reference checks in pull request previews.
 */

const nock = require("nock");
const tap = require("tap");
const { syndicationToken } = require("../../lib/common/lookup-tweet");

// SETUP
process.env.GITHUB_EVENT_NAME = "pull_request";
process.env.GITHUB_TOKEN = "secret123";
process.env.GITHUB_EVENT_PATH = require.resolve("./event.json");
process.env.TWITTER_ACCOUNT = "eth_classic";

// set other env variables so action-toolkit is happy
process.env.GITHUB_REF = "";
process.env.GITHUB_WORKSPACE = "";
process.env.GITHUB_WORKFLOW = "";
process.env.GITHUB_ACTION = "twitter-together";
process.env.GITHUB_ACTOR = "";
process.env.GITHUB_REPOSITORY = "";
process.env.GITHUB_SHA = "";

const ID = "0000000000000000001";

// MOCK
nock("https://api.github.com", {
  reqheaders: {
    authorization: "token secret123",
  },
})
  // get changed files
  .get("/repos/twitter-together/action/pulls/123/files")
  .reply(200, [
    {
      status: "added",
      filename: "tweets/hello-world.tweet",
    },
  ]);

// get pull request diff
nock("https://api.github.com", {
  reqheaders: {
    accept: "application/vnd.github.diff",
    authorization: "token secret123",
  },
})
  .get("/repos/twitter-together/action/pulls/123")
  .reply(
    200,
    `diff --git a/tweets/hello-world.tweet b/tweets/hello-world.tweet
new file mode 100644
index 0000000..d462a1f
--- /dev/null
+++ b/tweets/hello-world.tweet
@@ -0,0 +1,5 @@
+---
+retweet: https://x.com/m2rg/status/0000000000000000001
+---`
  );

nock("https://cdn.syndication.twimg.com")
  .get("/tweet-result")
  .query({ id: ID, token: syndicationToken(ID) })
  .reply(200, { __typename: "TweetTombstone" });

// create check run
nock("https://api.github.com")
  .post("/repos/twitter-together/action/check-runs", (body) => {
    tap.equal(body.name, "preview");
    tap.equal(body.head_sha, "0000000000000000000000000000000000000002");
    tap.equal(body.status, "completed");
    tap.equal(body.conclusion, "failure");
    tap.same(body.output, {
      title: "1 tweet(s)",
      summary: `### ❌ Invalid Tweet

\`\`\`tweet
---
retweet: https://x.com/m2rg/status/0000000000000000001
---
\`\`\`

**Referenced post https://x.com/m2rg/status/0000000000000000001 could not be found. It may have been deleted, or the account may be protected.**`,
    });

    return true;
  })
  .reply(201);

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
});

require("../../lib");
