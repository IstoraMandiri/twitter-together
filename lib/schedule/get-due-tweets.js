module.exports = getDueTweets;
module.exports.getSchedule = getSchedule;
module.exports.scanTweets = scanTweets;
module.exports.selectDue = selectDue;
module.exports.isClaimed = isClaimed;

const { readdirSync, readFileSync } = require("fs");
const { join, relative } = require("path");
const { load } = require("js-yaml");

// Tolerant of CRLF, and deliberately cheap: most tweet files are not
// scheduled and must not be fully parsed (their media may have been removed
// since, which would throw).
const FRONT_MATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function getSchedule(text) {
  const match = String(text).trim().match(FRONT_MATTER_REGEX);
  if (!match) return null;
  let parsed;
  try {
    parsed = load(match[1]);
  } catch (error) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { schedule } = parsed;
  // js-yaml turns an unquoted ISO timestamp into a Date
  if (typeof schedule !== "string" && !(schedule instanceof Date)) return null;
  const date = new Date(schedule);
  return isNaN(date.getTime()) ? null : date;
}

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && entry.name.endsWith(".tweet")) files.push(path);
  }
  return files;
}

/**
 * All tweet files that carry a `schedule`, whatever their date.
 *
 * @returns {{ filename: string, text: string, schedule: Date }[]}
 */
function scanTweets({ dir }) {
  return walk(join(dir, "tweets"))
    .map((path) => {
      const text = readFileSync(path, "utf8");
      return {
        // posix style, matching the paths used elsewhere in the action
        filename: relative(dir, path).split(/[\\/]/).join("/"),
        text,
        schedule: getSchedule(text),
      };
    })
    .filter((tweet) => tweet.schedule);
}

// "pending" is written when the tweet is merged and only means "queued";
// anything else means a publish run has already taken ownership of it
function isClaimed(entry) {
  return !!entry && entry.status !== "pending";
}

function selectDue(tweets, entries = {}, now = new Date()) {
  return tweets
    .filter(
      (tweet) => tweet.schedule <= now && !isClaimed(entries[tweet.filename])
    )
    .sort((a, b) => a.schedule - b.schedule);
}

/**
 * Find scheduled tweets that are due and have not been claimed yet.
 */
function getDueTweets(state, entries = {}, now = new Date()) {
  return selectDue(scanTweets(state), entries, now);
}
