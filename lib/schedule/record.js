// Publication records are check runs on the commit that added the tweet.
//
// Check runs can only be created or changed by a GitHub App (the workflow
// token acts as the GitHub Actions app) and can never be deleted, so a
// person with write access can neither forge a "published" record to
// suppress a tweet nor remove one to have it published again. This is the
// source of truth for "has this tweet been sent"; the ledger file is only
// an index.
module.exports = { recordName, findRecord, createRecord, completeRecord };

function recordName(filename) {
  return `scheduled tweet: ${filename}`;
}

function repo({ payload }) {
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  };
}

// newest record for this file on its commit, or null
async function findRecord(state, sha, filename) {
  const name = recordName(filename);
  const { data } = await state.octokit.request(
    "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
    { ...repo(state), ref: sha, check_name: name, per_page: 100 }
  );
  return (
    data.check_runs
      .filter((run) => run.name === name)
      .sort((a, b) => b.id - a.id)[0] || null
  );
}

// claim: an in-progress check run. Publishing only proceeds once this exists.
async function createRecord(state, sha, filename, summary) {
  const { data } = await state.octokit.request(
    "POST /repos/{owner}/{repo}/check-runs",
    {
      ...repo(state),
      name: recordName(filename),
      head_sha: sha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: { title: "Publishing", summary },
    }
  );
  return data;
}

async function completeRecord(state, id, conclusion, title, summary) {
  const { data } = await state.octokit.request(
    "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
    {
      ...repo(state),
      check_run_id: id,
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: { title, summary },
    }
  );
  return data;
}
