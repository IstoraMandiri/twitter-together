/**
 * Unit tests for the git helpers, against this repository's own history.
 */
const path = require("path");
const tap = require("tap");
const git = require("../../lib/schedule/git");

const repo = path.resolve(__dirname, "..", "..");

tap.match(
  git.addingCommit(repo, "package.json"),
  /^[0-9a-f]{40}$/,
  "adding commit"
);
tap.match(
  git.lastChange(repo, "package.json"),
  /^\d{4}-\d{2}-\d{2}T/,
  "last change"
);
tap.equal(git.addingCommit(repo, "does-not-exist.txt"), null, "unknown file");
tap.equal(git.lastChange(repo, "does-not-exist.txt"), null, "unknown file");
tap.equal(git.addingCommit("/", "package.json"), null, "not a repository");
tap.equal(git.lastChange("/", "package.json"), null, "not a repository");
