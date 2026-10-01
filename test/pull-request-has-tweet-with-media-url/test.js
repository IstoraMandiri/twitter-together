/**
 * A tweet with images loaded from an allowed host is previewed inline
 */

const nock = require("nock");
const tap = require("tap");
const path = require("path");

// SETUP
process.env.GITHUB_EVENT_NAME = "pull_request";
process.env.GITHUB_TOKEN = "secret123";
process.env.GITHUB_EVENT_PATH = require.resolve("./event.json");

// set other env variables so action-toolkit is happy
process.env.GITHUB_REF = "";
process.env.GITHUB_WORKSPACE = path.dirname(process.env.GITHUB_EVENT_PATH);
process.env.GITHUB_WORKFLOW = "";
process.env.GITHUB_ACTION = "twitter-together";
process.env.GITHUB_ACTOR = "";
process.env.GITHUB_REPOSITORY = "";
process.env.GITHUB_SHA = "";
process.env.MEDIA_URL_HOSTS = "other.example.com, *.public.blob.example.com";

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
    `diff --git a/tweets/media.tweet b/tweets/media.tweet
new file mode 100644
index 0000000..1715c04
--- /dev/null
+++ b/tweets/media.tweet
@@ -0,0 +1,8 @@
+---
+media:
+  - url: https://x1.public.blob.example.com/uploads/cat.png
+  - url: https://x1.public.blob.example.com/uploads/dog.jpg
+    alt: A dog
+---
+
+Here are some cute animals!`
  );

nock("https://x1.public.blob.example.com")
  .head("/uploads/cat.png")
  .reply(200, "", { "content-type": "image/png", "content-length": "1000" })
  .head("/uploads/dog.jpg")
  .reply(200, "", { "content-type": "image/jpeg" });

// create check run
nock("https://api.github.com")
  .post("/repos/twitter-together/action/check-runs", (body) => {
    tap.equal(body.name, "preview");
    tap.equal(body.head_sha, "0000000000000000000000000000000000000003");
    tap.equal(body.status, "completed");
    tap.equal(body.conclusion, "success");
    tap.same(body.output, {
      title: "1 tweet(s)",
      summary: `### ✅ Valid Tweet

<img src="https://x1.public.blob.example.com/uploads/cat.png" height="200" />

A dog
<img src="https://x1.public.blob.example.com/uploads/dog.jpg" height="200" />

> Here are some cute animals!`,
    });

    return true;
  })
  .reply(201);

process.on("exit", (code) => {
  tap.equal(code, 0);
  tap.same(nock.pendingMocks(), []);
});

require("../../lib");
