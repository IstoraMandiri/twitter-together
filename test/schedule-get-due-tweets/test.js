/**
 * Unit tests for finding due scheduled tweets on disk.
 */

const path = require("path");
const tap = require("tap");

const getDueTweets = require("../../lib/schedule/get-due-tweets");
const { getSchedule } = getDueTweets;

const dir = __dirname;
const now = new Date("2021-01-01T00:00:00Z");

tap.test("finds due tweets, earliest first, recursively", (t) => {
  const due = getDueTweets({ dir }, {}, now);
  t.same(
    due.map(({ filename }) => filename),
    [
      "tweets/a-earlier.tweet",
      "tweets/nested/c-nested.tweet",
      "tweets/b-later.tweet",
    ]
  );
  t.same(
    due.map(({ schedule }) => schedule.toISOString()),
    [
      "2020-01-01T00:00:00.000Z",
      "2020-03-01T00:00:00.000Z",
      "2020-06-01T00:00:00.000Z",
    ]
  );
  t.end();
});

tap.test("skips tweets already claimed, but not pending ones", (t) => {
  const due = getDueTweets(
    { dir },
    {
      "tweets/a-earlier.tweet": { status: "published" },
      "tweets/nested/c-nested.tweet": { status: "failed" },
      "tweets/b-later.tweet": { status: "pending" },
    },
    now
  );
  t.same(
    due.map(({ filename }) => filename),
    ["tweets/b-later.tweet"]
  );
  t.notOk(getDueTweets.isClaimed(undefined));
  t.notOk(getDueTweets.isClaimed({ status: "pending" }));
  t.ok(getDueTweets.isClaimed({ status: "publishing" }));
  t.ok(getDueTweets.isClaimed({ status: "missing" }));
  t.equal(getDueTweets.scanTweets({ dir }).length, 4, "all scheduled files");
  t.end();
});

tap.test("returns nothing when there is no tweets directory", (t) => {
  t.same(getDueTweets({ dir: path.join(dir, "nope") }, {}, now), []);
  t.end();
});

tap.test("rethrows unexpected directory errors", (t) => {
  // a file where a directory is expected gives ENOTDIR, not ENOENT
  t.throws(
    () => getDueTweets({ dir: path.join(dir, "event.json") }, {}, now),
    /ENOTDIR/
  );
  t.end();
});

tap.test("getSchedule", (t) => {
  t.equal(getSchedule("no front matter"), null);
  t.equal(getSchedule("---\nretweet: x\n---\n\nhi"), null, "no schedule key");
  t.equal(getSchedule("---\nschedule: nonsense\n---"), null, "unparsable date");
  t.equal(getSchedule("---\nschedule: [broken: yaml\n---"), null, "bad yaml");
  t.equal(getSchedule("---\n- a\n- b\n---"), null, "front matter is a list");
  t.equal(getSchedule("---\n\n---"), null, "empty front matter");
  t.equal(getSchedule("---\nschedule: 5\n---"), null, "not a date");
  t.equal(
    getSchedule(
      '---\nschedule: "2030-01-02T03:04:00Z"\n---\n\nhi'
    ).toISOString(),
    "2030-01-02T03:04:00.000Z",
    "quoted string"
  );
  t.equal(
    getSchedule(
      "---\r\nschedule: 2030-01-02T03:04:00Z\r\n---\r\n\r\nhi"
    ).toISOString(),
    "2030-01-02T03:04:00.000Z",
    "unquoted date, CRLF"
  );
  t.end();
});
