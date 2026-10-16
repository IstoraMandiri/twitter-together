module.exports = commentOnPullRequest;

/**
 * Comments on the pull request that brought in a commit, e.g. with the URL
 * of the published tweet. Best effort: the tweet is out either way, so a
 * missing pull request or a failed request only logs a warning.
 *
 * Needs `pull-requests: write` for the workflow's token.
 *
 * @returns the pull request number, or undefined
 */
async function commentOnPullRequest({ octokit, toolkit, payload }, sha, body) {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  // see the `request.error` hooks: these errors are thrown, not fatal
  const request = { bestEffort: true };
  try {
    // https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit
    const { data: pulls } = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
      { owner, repo, commit_sha: sha, request }
    );
    const pull = pulls.find((p) => p.merged_at) || pulls[0];
    if (!pull) {
      toolkit.info(`No pull request found for ${sha}, not commenting`);
      return;
    }
    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      { owner, repo, issue_number: pull.number, body, request }
    );
    toolkit.info(`Commented on pull request #${pull.number}`);
    return pull.number;
  } catch (error) {
    toolkit.warning(
      `Could not comment on the pull request for ${sha}: ${
        error.status ? `${error.status} ` : ""
      }${error.message}`
    );
  }
}

module.exports.tweetedComment = tweetedComment;
module.exports.failedComment = failedComment;

// 2026-10-16T18:00:00.000Z -> 2026-10-16 18:00 UTC
const formatTime = (date) =>
  date.toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** the comment for a published tweet (or thread) */
function tweetedComment(urls, scheduled) {
  const when = scheduled ? `, as scheduled for ${formatTime(scheduled)}` : "";
  return `🐦 Tweeted${when}:\n\n- ${urls.join("\n- ")}`;
}

/** the comment for a tweet that could not be published */
function failedComment(filename, message, hint) {
  const quoted = String(message).split("\n").join("\n> ");
  return `⚠️ Tweeting \`${filename}\` failed:\n\n> ${quoted}${
    hint ? `\n\n${hint}` : ""
  }`;
}
