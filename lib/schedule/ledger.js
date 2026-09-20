// Records which scheduled tweets have already been claimed / published, so a
// tweet is never published twice. Stored in the repository so that it
// survives between workflow runs, and updated through the contents API so
// that concurrent updates are rejected rather than silently merged.
const LEDGER_PATH =
  process.env.SCHEDULE_LEDGER_PATH || ".github/published-tweets.json";

module.exports = { readLedger, writeLedger, LEDGER_PATH };

async function readLedger({ octokit, payload }) {
  try {
    const { data } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        path: LEDGER_PATH,
        ref: payload.repository.default_branch,
        headers: { "cache-control": "no-cache" },
        request: { expectStatus: 404 },
      }
    );
    return {
      sha: data.sha,
      entries: JSON.parse(Buffer.from(data.content, "base64").toString("utf8")),
    };
  } catch (error) {
    if (error.status === 404) return { sha: undefined, entries: {} };
    throw error;
  }
}

async function writeLedger({ octokit, payload }, { sha, entries }, message) {
  const { data } = await octokit.request(
    "PUT /repos/{owner}/{repo}/contents/{path}",
    {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      path: LEDGER_PATH,
      branch: payload.repository.default_branch,
      message: `${message}\n\n[skip ci]`,
      sha,
      content: Buffer.from(
        `${JSON.stringify(sortKeys(entries), null, 2)}\n`,
        "utf8"
      ).toString("base64"),
    }
  );
  return { sha: data.content.sha, entries };
}

function sortKeys(entries) {
  return Object.keys(entries)
    .sort()
    .reduce((acc, key) => {
      acc[key] = entries[key];
      return acc;
    }, {});
}
