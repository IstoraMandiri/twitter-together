module.exports = handleSchedule;

const { inspect } = require("util");

const tweet = require("../common/tweet");
const formatError = require("../common/format-error");
const parseTweetFileContent = require("../common/parse-tweet-file-content");

const git = require("./git");
const { scanTweets, selectDue } = require("./get-due-tweets");
const { readLedger, writeLedger, LEDGER_PATH } = require("./ledger");
const { findRecord, createRecord, completeRecord } = require("./record");

// an unknown scheduled tweet this long past its time is not published
// automatically; it is marked "expired" for a human to look at
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Publish tweets whose `schedule` front matter is due.
 *
 * Runs from a `schedule` (cron), `workflow_dispatch` or `repository_dispatch`
 * trigger. Scheduled tweets are deliberately NOT published when their pull
 * request is merged; this is the only place they are sent.
 *
 * Two stores are involved:
 *   - the ledger file (an index, see ledger.js) says what is queued; it is
 *     written by the merge and by this run, and read by whoever decides to
 *     trigger this run. It is not trusted to decide whether to publish.
 *   - publication records (check runs, see record.js) say what has been
 *     sent. A tweet is published only if no record exists for it, and a
 *     record is created before the tweet is sent, so a crash can never
 *     cause a double publish.
 */
async function handleSchedule(state) {
  const { toolkit, octokit } = state;

  // on request errors, log the request options and error, then end process
  octokit.hook.error("request", (error, options) => {
    if (options.request.expectStatus === error.status) throw error;
    toolkit.info(error);
    toolkit.setFailed(error.stack);
    process.exit();
  });

  const ledger = await readLedger(state);

  const now = new Date();
  const scheduledTweets = scanTweets(state);

  // a tweet queued on merge whose file has since been removed must not stay
  // "pending" forever, or callers would keep asking for it
  const present = new Set(scheduledTweets.map(({ filename }) => filename));
  const missing = Object.entries(ledger.entries)
    .filter(
      ([filename, entry]) =>
        entry.status === "pending" && !present.has(filename)
    )
    .map(([filename]) => filename);
  missing.forEach((filename) => {
    ledger.entries[filename].status = "missing";
    ledger.entries[filename].missingAt = now.toISOString();
  });

  // a scheduled tweet the ledger does not know about (e.g. its merge could
  // not write the ledger) is queued now, so whoever asks can see it waiting;
  // unless it is long overdue, which needs a human to look at it
  const queuedAt = now.toISOString();
  const added = scheduledTweets
    .filter(({ filename }) => !ledger.entries[filename])
    .map(({ filename, schedule }) => {
      const expired = now - schedule > EXPIRE_MS;
      ledger.entries[filename] = {
        status: expired ? "expired" : "pending",
        scheduled: schedule.toISOString(),
        queuedAt,
      };
      return filename;
    });

  // a failed tweet whose file has been changed since is queued again; the
  // publication record decides whether it may actually be retried
  const requeued = scheduledTweets
    .filter(({ filename }) => {
      const entry = ledger.entries[filename];
      if (!entry || entry.status !== "failed" || !entry.failedAt) return false;
      const changed = git.lastChange(state.dir, filename);
      return !!changed && new Date(changed) > new Date(entry.failedAt);
    })
    .map(({ filename }) => {
      ledger.entries[filename].status = "pending";
      ledger.entries[filename].requeuedAt = queuedAt;
      return filename;
    });

  const due = selectDue(scheduledTweets, ledger.entries, now);

  if (due.length === 0) {
    const changes = [];
    if (added.length) changes.push(`Queue ${added.length} scheduled tweet(s)`);
    if (requeued.length)
      changes.push(`Requeue ${requeued.length} changed tweet(s)`);
    if (missing.length)
      changes.push(
        `Mark ${missing.length} removed scheduled tweet(s) as missing`
      );
    if (changes.length) {
      toolkit.info(changes.join("; "));
      await writeLedger(state, ledger, changes.join("; "));
    }
    return toolkit.info("No scheduled tweets are due");
  }

  toolkit.info(
    `${due.length} scheduled tweet(s) due: ${due
      .map(({ filename }) => filename)
      .join(", ")}`
  );

  const errors = [];
  for (const item of due) {
    const entry = ledger.entries[item.filename];
    const fail = (message) => {
      entry.status = "failed";
      entry.failedAt = new Date().toISOString();
      entry.error = message;
      errors.push(`${item.filename}: ${message}`);
    };

    // records live on the commit that added the file
    const sha = git.addingCommit(state.dir, item.filename);
    if (!sha) {
      fail(
        "Could not find the commit that added this tweet. Is the checkout shallow? Use fetch-depth: 0."
      );
      continue;
    }

    // never publish a tweet that has a record, unless it failed and the file
    // has been changed since (someone fixed it)
    let existing;
    try {
      existing = await findRecord(state, sha, item.filename);
    } catch (error) {
      fail(formatError(error));
      continue;
    }
    if (existing) {
      const changed = git.lastChange(state.dir, item.filename);
      const retry =
        existing.status === "completed" &&
        existing.conclusion === "failure" &&
        !!changed &&
        !!existing.completed_at &&
        new Date(changed) > new Date(existing.completed_at);
      if (!retry) {
        entry.status =
          existing.status !== "completed"
            ? "publishing"
            : existing.conclusion === "success"
            ? "published"
            : "failed";
        entry.record = existing.html_url;
        toolkit.info(
          `Skipping ${item.filename}: already ${entry.status} (${existing.html_url})`
        );
        continue;
      }
      toolkit.info(`Retrying ${item.filename}: file changed since it failed`);
    }

    // claim, then publish
    let record;
    try {
      record = await createRecord(
        state,
        sha,
        item.filename,
        `Scheduled for ${item.schedule.toISOString()}`
      );
    } catch (error) {
      fail(formatError(error));
      continue;
    }
    entry.status = "publishing";
    entry.claimedAt = new Date().toISOString();
    entry.record = record.html_url;

    try {
      const parsed = parseTweetFileContent(item.text, state.dir);
      toolkit.info(`Tweeting (scheduled): ${parsed.text}`);

      const urls = [];
      let result = await tweet(state, parsed, item.filename);
      while (result) {
        toolkit.info(`tweeted: ${result.url}`);
        urls.push(result.url);
        result = result.thread;
      }

      entry.status = "published";
      entry.publishedAt = new Date().toISOString();
      entry.urls = urls;
      await completeRecord(
        state,
        record.id,
        "success",
        "Published",
        urls.join("\n")
      );
    } catch (error) {
      const failure = Array.isArray(error) ? error[0] : error;
      toolkit.error(inspect(failure));
      fail(formatError(failure));
      await completeRecord(state, record.id, "failure", "Failed", entry.error);
    }
  }

  // record the outcome in the index; retry on conflict so it is never lost
  await updateWithRetry(
    state,
    ledger,
    `Publish ${due.length} scheduled tweet(s)`
  );

  if (errors.length) {
    return toolkit.setFailed(
      `Error publishing scheduled tweets:\n- ${errors.join("\n- ")}\n\n` +
        `To retry a failed tweet, push a fix to its file. See ${LEDGER_PATH} for details.`
    );
  }
}

async function updateWithRetry(state, ledger, message, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await writeLedger(state, ledger, message);
    } catch (error) {
      // 409: someone else updated the ledger since we read it. Re-read and
      // reapply our entries, which are authoritative for these files.
      if (error.status !== 409 || attempt >= attempts) throw error;
      state.toolkit.info(`Ledger conflict, retrying (${attempt})`);
      const latest = await readLedger(state);
      ledger.sha = latest.sha;
      ledger.entries = { ...latest.entries, ...ledger.entries };
    }
  }
}
