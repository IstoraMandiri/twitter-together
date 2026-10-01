/**
 * Unit tests for media loaded from URLs: allowed hosts, media kinds and
 * X's limits on combining media
 */
const tap = require("tap");

const {
  isAllowedHost,
  checkMediaUrl,
  mediaKind,
  validateMediaSet,
  contentTypeMatches,
} = require("../../lib/common/media");
const parseTweetFileContent = require("../../lib/common/parse-tweet-file-content");

// allowed hosts
tap.equal(isAllowedHost("a.example.com", "a.example.com"), true);
tap.equal(isAllowedHost("A.Example.com", " other.com , a.example.com"), true);
tap.equal(isAllowedHost("b.example.com", "a.example.com"), false);
tap.equal(isAllowedHost("x.blob.example.com", "*.blob.example.com"), true);
// wildcards only match subdomains
tap.equal(isAllowedHost("blob.example.com", "*.blob.example.com"), false);
tap.equal(isAllowedHost("evilblob.example.com", "*.blob.example.com"), false);
tap.equal(isAllowedHost("anything.org", "*"), true);
tap.equal(isAllowedHost("anything.org", ""), false);
tap.equal(isAllowedHost("anything.org", undefined), false);

// kinds
tap.equal(mediaKind("a.PNG"), "image");
tap.equal(mediaKind("/x/a.jpeg"), "image");
tap.equal(mediaKind("a.gif"), "gif");
tap.equal(mediaKind("a.mp4"), "video");
tap.equal(mediaKind("a.txt"), null);

tap.equal(contentTypeMatches("image/png", "image"), true);
tap.equal(contentTypeMatches("IMAGE/JPEG; charset=binary", "image"), true);
tap.equal(contentTypeMatches("image/gif", "image"), false);
tap.equal(contentTypeMatches("image/gif", "gif"), true);
tap.equal(contentTypeMatches("video/mp4", "video"), true);
tap.equal(contentTypeMatches("video/quicktime", "video"), false);
tap.equal(contentTypeMatches(undefined, "image"), false);

// checking URLs
delete process.env.MEDIA_URL_HOSTS;
tap.throws(
  () => checkMediaUrl("https://media.example.com/a.png"),
  /Set the MEDIA_URL_HOSTS environment variable/
);
process.env.MEDIA_URL_HOSTS = "media.example.com";
tap.same(checkMediaUrl("https://media.example.com/a%20b.png?x=1"), {
  url: "https://media.example.com/a%20b.png?x=1",
  kind: "image",
  mimeType: "image/png",
});
tap.same(
  checkMediaUrl("https://media.example.com/v.m4v").mimeType,
  "video/mp4"
);
tap.throws(() => checkMediaUrl("not a url"), /Invalid media URL: not a url/);
tap.throws(
  () => checkMediaUrl("http://media.example.com/a.png"),
  /Media URLs must use https/
);
tap.throws(
  () => checkMediaUrl("https://other.example.com/a.png"),
  /Media host other.example.com is not allowed/
);
tap.throws(
  () => checkMediaUrl("https://media.example.com/a.mov"),
  /Only MP4 videos are supported/
);
tap.throws(
  () => checkMediaUrl("https://media.example.com/a.txt"),
  /Unsupported media type/
);

// combining media
const image = { kind: "image" };
validateMediaSet([image, image, image, image]);
validateMediaSet([{ kind: "video" }]);
tap.throws(
  () => validateMediaSet([image, image, image, image, image]),
  /up to 4 images, found 5 images/
);
tap.throws(
  () => validateMediaSet([image, { kind: "video" }]),
  /up to 4 images, or a single video or GIF, but not both/
);
tap.throws(
  () => validateMediaSet([{ kind: "gif" }, { kind: "gif" }]),
  /a single video or GIF/
);

// parsing tweet files
process.env.MEDIA_URL_HOSTS = "*";
const parsed = parseTweetFileContent(
  `---
media:
  - url: https://anywhere.example.org/clip.mp4
    alt: A clip
---

Watch this`,
  __dirname
);
tap.same(parsed.media, [
  {
    url: "https://anywhere.example.org/clip.mp4",
    alt: "A clip",
    kind: "video",
    mimeType: "video/mp4",
  },
]);

tap.throws(
  () =>
    parseTweetFileContent(
      `---
media:
  - url: https://anywhere.example.org/clip.mp4
  - url: https://anywhere.example.org/cat.png
---

Mixed`,
      __dirname
    ),
  /but not both/
);
tap.throws(
  () =>
    parseTweetFileContent(
      `---
media:
  - url: https://anywhere.example.org/cat.png
    file: cat.png
---

Both`,
      __dirname
    ),
  /Each media item needs either a `file` or a `url`/
);
tap.throws(
  () =>
    parseTweetFileContent(
      `---
media:
  - alt: Nothing
---

Neither`,
      __dirname
    ),
  /Each media item needs either a `file` or a `url`/
);
tap.throws(
  () =>
    parseTweetFileContent(
      `---
media:
  - url: https://anywhere.example.org/cat.png
    alt: ${"a".repeat(1001)}
---

Long alt`,
      __dirname
    ),
  /alt text must be 1000 characters or less/
);
