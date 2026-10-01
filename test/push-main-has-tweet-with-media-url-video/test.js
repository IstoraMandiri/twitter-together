/**
 * Publishing a tweet with a video loaded from a URL: the video is downloaded,
 * uploaded to X in chunks, X's processing is awaited, then the tweet is sent.
 */

const fs = require("fs");
const os = require("os");
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
process.env.MEDIA_URL_HOSTS = "*.public.blob.example.com";

// set other env variables so action-toolkit is happy
process.env.GITHUB_WORKFLOW = "";
process.env.GITHUB_ACTION = "twitter-together";
process.env.GITHUB_ACTOR = "";
process.env.GITHUB_REPOSITORY = "";
process.env.GITHUB_SHA = "";

const VIDEO = Buffer.alloc(3000, 7);
const tempDirs = () =>
  fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith("twitter-together-"));
const tempBefore = tempDirs();

// MOCK
nock("https://api.github.com", {
  reqheaders: {
    authorization: "token secret123",
  },
})
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

  .post(
    "/repos/twitter-together/action/commits/0000000000000000000000000000000000000002/comments",
    (body) => {
      tap.equal(
        body.body,
        "Tweeted:\n\n- https://x.com/gr2m/status/0000000000000000001"
      );
      return true;
    }
  )
  .reply(201);

// the video download
nock("https://x1.public.blob.example.com")
  .get("/uploads/launch.mp4")
  .reply(200, VIDEO, { "content-type": "video/mp4" });

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
    tap.equal(body.text, "Watch the launch");
    tap.same(body.media.media_ids, ["0000000000000000002"]);
    return true;
  })
  .reply(201, {
    data: {
      id: "0000000000000000001",
      text: "Watch the launch https://t.co/abcdeFGHIJ",
    },
  });

nock("https://upload.twitter.com")
  .post("/1.1/media/upload.json", (body) => {
    tap.match(
      body,
      'Content-Disposition: form-data; name="command"\r\n\r\nINIT'
    );
    tap.match(
      body,
      'Content-Disposition: form-data; name="total_bytes"\r\n\r\n3000'
    );
    tap.match(
      body,
      'Content-Disposition: form-data; name="media_type"\r\n\r\nvideo/mp4'
    );
    tap.match(
      body,
      'Content-Disposition: form-data; name="media_category"\r\n\r\nTweetVideo'
    );
    return true;
  })
  .reply(202, {
    media_id_string: "0000000000000000002",
    expires_after_secs: 86400,
  })

  .post("/1.1/media/upload.json", (body) => {
    tap.match(
      body,
      'Content-Disposition: form-data; name="command"\r\n\r\nAPPEND'
    );
    return true;
  })
  .reply(204)

  .post("/1.1/media/upload.json", (body) => {
    tap.match(
      body,
      'Content-Disposition: form-data; name="command"\r\n\r\nFINALIZE'
    );
    return true;
  })
  .reply(201, {
    media_id_string: "0000000000000000002",
    size: 3000,
    processing_info: { state: "pending", check_after_secs: 1 },
  })

  // X processes the video, the upload waits for it
  .get("/1.1/media/upload.json")
  .query({ command: "STATUS", media_id: "0000000000000000002" })
  .reply(200, {
    media_id_string: "0000000000000000002",
    processing_info: { state: "succeeded", progress_percent: 100 },
  })

  .post("/1.1/media/metadata/create.json", (body) => {
    tap.equal(body.media_id, "0000000000000000002");
    tap.equal(body.alt_text.text, "The launch");
    return true;
  })
  .reply(200);

// assertions at exit are not counted by tap, fail the process instead
process.on("exit", (code) => {
  const problems = [];
  if (code !== 0) problems.push(`exit code ${code}`);
  if (!nock.isDone()) problems.push(`pending mocks: ${nock.pendingMocks()}`);
  if (tempDirs().length !== tempBefore.length)
    problems.push("the downloaded video was not removed");
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  }
});

require("../../lib");
