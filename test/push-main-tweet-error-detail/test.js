/**
 * This test checks that X's error detail is included in the commit comment
 * when publishing fails (e.g. quoting a third party post).
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
        filename: "tweets/hello-world.tweet",
      },
    ],
  })

  // post comment
  .post(
    "/repos/twitter-together/action/commits/0000000000000000000000000000000000000002/comments",
    (body) => {
      tap.equal(
        body.body,
        "Errors:\n\n- Request failed with code 403: You can only reply to or quote posts where you are mentioned or are the author."
      );
      return true;
    }
  )
  .reply(201);

nock("https://api.twitter.com")
  .get("/2/users/me")
  .reply(200, {
    data: {
      id: "123",
      name: "gr2m",
      username: "gr2m",
    },
  })

  .post("/2/tweets", (body) => {
    tap.equal(body.text, "Smart thinking!");
    tap.equal(body.quote_tweet_id, "0000000000000000001");
    return true;
  })
  .reply(403, {
    detail:
      "You can only reply to or quote posts where you are mentioned or are the author.",
    status: 403,
    title: "Authorization Error",
    type: "https://api.x.com/2/problems/not-authorized-for-resource",
  });

process.on("exit", (code) => {
  tap.equal(code, 1);
  tap.same(nock.pendingMocks(), []);

  // above code exits with 1 (error), but tap expects 0.
  // Tap adds the "process.exitCode" property for that purpose.
  process.exitCode = 0;
});

require("../../lib");
