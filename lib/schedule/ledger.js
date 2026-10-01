// Records which scheduled tweets have been queued / claimed / published, so
// a tweet is never published twice. Stored in the repository so that it
// survives between workflow runs, and updated through the contents API so
// that concurrent updates are rejected rather than silently merged.
//
// It lives on its own branch: the default branch is usually protected
// (pull requests only), which would block the workflow from writing to it.
// The branch is created, as an orphan holding only the ledger, on first use.
const LEDGER_PATH =
  process.env.SCHEDULE_LEDGER_PATH || ".github/published-tweets.json";
const LEDGER_BRANCH = process.env.SCHEDULE_LEDGER_BRANCH || "published-tweets";

module.exports = { readLedger, writeLedger, LEDGER_PATH, LEDGER_BRANCH };

function repo({ payload }) {
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  };
}

async function readLedger(state) {
  try {
    const { data } = await state.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        ...repo(state),
        path: LEDGER_PATH,
        ref: LEDGER_BRANCH,
        headers: { "cache-control": "no-cache" },
        request: { expectStatus: 404 },
      }
    );
    return {
      sha: data.sha,
      entries: JSON.parse(Buffer.from(data.content, "base64").toString("utf8")),
    };
  } catch (error) {
    // no branch, or no file on it yet
    if (error.status === 404) return { sha: undefined, entries: {} };
    throw error;
  }
}

async function writeLedger(state, { sha, entries }, message) {
  if (!sha) {
    // nothing was read: make sure the branch exists before writing to it
    const created = await ensureBranch(state);
    if (created) sha = created;
  }
  const { data } = await state.octokit.request(
    "PUT /repos/{owner}/{repo}/contents/{path}",
    {
      ...repo(state),
      path: LEDGER_PATH,
      branch: LEDGER_BRANCH,
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

// Create the ledger branch as an orphan commit containing an empty ledger.
// Returns the blob sha of the created file, or undefined if the branch
// already existed.
async function ensureBranch(state) {
  const { octokit } = state;
  try {
    await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      ...repo(state),
      ref: `heads/${LEDGER_BRANCH}`,
      request: { expectStatus: 404 },
    });
    return undefined;
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  state.toolkit.info(`Creating ledger branch "${LEDGER_BRANCH}"`);
  const { data: blob } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/blobs",
    { ...repo(state), content: "{}\n", encoding: "utf-8" }
  );
  const { data: tree } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/trees",
    {
      ...repo(state),
      tree: [
        { path: LEDGER_PATH, mode: "100644", type: "blob", sha: blob.sha },
      ],
    }
  );
  const { data: commit } = await octokit.request(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      ...repo(state),
      message: "Create scheduled tweet ledger\n\n[skip ci]",
      tree: tree.sha,
      parents: [],
    }
  );
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    ...repo(state),
    ref: `refs/heads/${LEDGER_BRANCH}`,
    sha: commit.sha,
  });
  return blob.sha;
}

function sortKeys(entries) {
  return Object.keys(entries)
    .sort()
    .reduce((acc, key) => {
      acc[key] = entries[key];
      return acc;
    }, {});
}
