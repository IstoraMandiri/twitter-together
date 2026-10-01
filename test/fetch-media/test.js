/**
 * Unit tests for loading media from URLs: the private address guard,
 * redirects, HEAD checks and size-capped downloads
 */
const fs = require("fs");

const nock = require("nock");
const tap = require("tap");

const {
  headMedia,
  downloadMedia,
  createSafeLookup,
  isPrivateAddress,
  MediaError,
  settings,
} = require("../../lib/common/fetch-media");
const checkMedia = require("../../lib/common/check-media");

const MB = 1024 * 1024;
const HOST = "https://media.example.com";

nock.disableNetConnect();

tap.test("private addresses", async (t) => {
  for (const ip of [
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.8",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:10.0.0.1",
    "64:ff9b::127.0.0.1",
    "::ffff:a00:1",
    "::ffff:c0a8:101",
    "64:ff9b::a9fe:a9fe",
    "::7f00:1",
    "not an ip",
  ])
    t.equal(isPrivateAddress(ip), true, ip);
  for (const ip of [
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700::1111",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])
    t.equal(isPrivateAddress(ip), false, ip);
});

tap.test("safe lookup", async (t) => {
  const fake = (addresses, error) => (hostname, options, callback) => {
    t.equal(options.all, true, "always resolves all addresses");
    callback(error, addresses);
  };

  const lookup = createSafeLookup(
    fake([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800::1", family: 6 },
    ])
  );
  await new Promise((resolve) =>
    lookup("example.com", (error, address, family) => {
      t.equal(error, null);
      t.equal(address, "93.184.216.34");
      t.equal(family, 4);
      resolve();
    })
  );
  await new Promise((resolve) =>
    lookup("example.com", { all: true }, (error, addresses) => {
      t.equal(addresses.length, 2);
      resolve();
    })
  );

  // one private address is enough to refuse, DNS rebinding may pick it
  const rebinding = createSafeLookup(
    fake([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ])
  );
  await new Promise((resolve) =>
    rebinding("evil.example.com", {}, (error) => {
      t.type(error, MediaError);
      t.match(error.message, /resolves to the private address 10.0.0.5/);
      resolve();
    })
  );

  const failing = createSafeLookup(fake(null, new Error("ENOTFOUND")));
  await new Promise((resolve) =>
    failing("nowhere.example.com", {}, (error) => {
      t.equal(error.message, "ENOTFOUND");
      resolve();
    })
  );
});

tap.test("HEAD checks", async (t) => {
  nock(HOST)
    .head("/ok.png")
    .reply(200, "", { "content-type": "image/png", "content-length": "1234" });
  t.same(await headMedia(`${HOST}/ok.png`, "image"), {
    contentType: "image/png",
    size: 1234,
  });

  nock(HOST).head("/missing.png").reply(404);
  await t.rejects(headMedia(`${HOST}/missing.png`, "image"), {
    constructor: MediaError,
    message: `Media ${HOST}/missing.png does not exist`,
  });

  nock(HOST).head("/page.png").reply(200, "", { "content-type": "text/html" });
  await t.rejects(headMedia(`${HOST}/page.png`, "image"), {
    constructor: MediaError,
    message: /has content type "text\/html", which is not a supported image/,
  });

  nock(HOST)
    .head("/big.mp4")
    .reply(200, "", {
      "content-type": "video/mp4",
      "content-length": String(600 * MB),
    });
  await t.rejects(headMedia(`${HOST}/big.mp4`, "video"), {
    constructor: MediaError,
    message: /is too big \(600.0MB\), X allows up to 512MB for a video/,
  });

  nock(HOST).head("/error.png").reply(500);
  const error = await headMedia(`${HOST}/error.png`, "image").catch((e) => e);
  t.notOk(error instanceof MediaError, "server errors may go away");
  t.match(error.message, /failed with status 500/);

  // servers without HEAD support
  nock(HOST)
    .head("/nohead.gif")
    .reply(405)
    .get("/nohead.gif")
    .reply(200, "GIF89a", { "content-type": "image/gif" });
  t.same(await headMedia(`${HOST}/nohead.gif`, "gif"), {
    contentType: "image/gif",
    size: null,
  });
});

tap.test("redirects", async (t) => {
  nock(HOST)
    .head("/a.png")
    .reply(302, "", { location: "/b.png" })
    .head("/b.png")
    .reply(301, "", { location: "https://cdn.example.com/c.png" });
  nock("https://cdn.example.com")
    .head("/c.png")
    .reply(200, "", { "content-type": "image/png" });
  t.equal((await headMedia(`${HOST}/a.png`, "image")).contentType, "image/png");

  // every hop is checked
  nock(HOST)
    .head("/internal.png")
    .reply(302, "", { location: "https://169.254.169.254/latest/meta-data" });
  await t.rejects(headMedia(`${HOST}/internal.png`, "image"), {
    constructor: MediaError,
    message: /private address 169.254.169.254/,
  });

  nock(HOST)
    .head("/insecure.png")
    .reply(302, "", { location: "http://media.example.com/x.png" });
  await t.rejects(headMedia(`${HOST}/insecure.png`, "image"), {
    constructor: MediaError,
    message: /must use https/,
  });

  nock(HOST)
    .head(/\/loop\d/)
    .times(4)
    .reply(302, (uri) => "", {
      location: (req) => `/loop${Number(req.path.slice(5)) + 1}`,
    });
  await t.rejects(headMedia(`${HOST}/loop0`, "image"), {
    constructor: MediaError,
    message: /Too many redirects/,
  });

  await t.rejects(headMedia("https://[::1]/a.png", "image"), {
    constructor: MediaError,
    message: /private address ::1/,
  });
});

tap.test("downloads", async (t) => {
  const body = Buffer.alloc(2048, 1);
  nock(HOST).get("/clip.mp4").reply(200, body, { "content-type": "video/mp4" });
  const download = await downloadMedia(`${HOST}/clip.mp4`, "video");
  t.equal(download.size, 2048);
  t.match(download.file, /clip\.mp4$/);
  t.same(fs.readFileSync(download.file), body);
  await download.cleanup();
  t.equal(fs.existsSync(download.file), false, "cleaned up");

  // no content-length: the cap applies while streaming
  nock(HOST)
    .get("/huge.png")
    .reply(200, () => Buffer.alloc(5 * MB + 1), {
      "content-type": "image/png",
    });
  await t.rejects(downloadMedia(`${HOST}/huge.png`, "image"), {
    constructor: MediaError,
    message: /is too big \(5.0MB\), X allows up to 5MB for a image/,
  });

  nock(HOST).get("/gone.png").reply(404);
  await t.rejects(downloadMedia(`${HOST}/gone.png`, "image"), {
    constructor: MediaError,
  });

  nock(HOST).get("/broken.png").replyWithError("socket hang up");
  await t.rejects(downloadMedia(`${HOST}/broken.png`, "image"), {
    message: "socket hang up",
  });
});

tap.test("timeouts", async (t) => {
  const { timeout } = settings;
  settings.timeout = 50;
  nock(HOST).head("/slow.png").delay(500).reply(200);
  await t.rejects(headMedia(`${HOST}/slow.png`, "image"), {
    message: `Timed out loading ${HOST}/slow.png`,
  });
  settings.timeout = timeout;
});

tap.test("checking a tweet's media", async (t) => {
  nock(HOST)
    .head("/a.png")
    .reply(404)
    .head("/b.png")
    .replyWithError("ECONNRESET");
  const result = await checkMedia({
    media: [{ url: `${HOST}/a.png`, kind: "image" }],
    thread: {
      media: [
        { file: "/repo/media/local.png", kind: "image" },
        { url: `${HOST}/b.png`, kind: "image" },
      ],
    },
  });
  t.same(result, {
    errors: [`Media ${HOST}/a.png does not exist`],
    warnings: [
      `Could not verify ${HOST}/b.png (ECONNRESET). It will be checked again when the tweet is published.`,
    ],
  });
});

tap.teardown(() => {
  if (!nock.isDone()) throw new Error(`pending: ${nock.pendingMocks()}`);
});
