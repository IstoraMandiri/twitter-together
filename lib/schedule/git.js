// Thin wrappers around git for the checked out repository. Exposed as
// properties so tests can replace them.
const { execFileSync } = require("child_process");

module.exports = { run, addingCommit, lastChange };

function run(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// The commit that first added a file. Stable for the file's whole life, so
// it is what publication records are attached to. Needs full history
// (actions/checkout with fetch-depth: 0); returns null otherwise.
function addingCommit(dir, filename) {
  try {
    const lines = module.exports
      .run(["log", "--diff-filter=A", "--format=%H", "--", filename], dir)
      .split("\n")
      .filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch (error) {
    return null;
  }
}

// ISO date of the last commit that touched a file, or null.
function lastChange(dir, filename) {
  try {
    return (
      module.exports.run(["log", "-1", "--format=%cI", "--", filename], dir) ||
      null
    );
  } catch (error) {
    return null;
  }
}
