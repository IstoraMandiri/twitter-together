module.exports = handleSchedule;

const { inspect } = require("util");

const tweet = require("../common/tweet");
const formatError = require("../common/format-error");
const parseTweetFileContent = require("../common/parse-tweet-file-content");

const { scanTweets, selectDue } = require("./get-due-tweets");
const { readLedger, writeLedger, LEDGER_PATH } = require("./ledger");

/**
 * Publish tweets whose `schedule` front matter is due.
 *
 * Runs from a `schedule` (cron) or `workflow_dispatch` trigger. Scheduled
 * tweets are deliberately NOT published when their pull request is merged;
 * this is the only place they are sent.
 *
 * Every tweet is claimed in the ledger BEFORE it is published. If the run
 * dies midway the tweet stays claimed and is never sent twice; the worst
 * case is a tweet that has to be released by hand, which is preferable to
 * publishing it twice.
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

  let ledger = await readLedger(state);

  const now = new Date();
  const scheduledTweets = scanTweets(state);
  const due = selectDue(scheduledTweets, ledger.entries, now);

  // a tweet that was queued on merge but whose file has since been removed
  // must not stay "pending" forever, or callers would keep asking for it
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
  // not write the ledger) is queued now, so whoever asks can see it waiting
  const queuedAt = now.toISOString();
  const added = scheduledTweets
    .filter(({ filename }) => !ledger.entries[filename])
    .map(({ filename, schedule }) => {
      ledger.entries[filename] = {
        status: "pending",
        scheduled: schedule.toISOString(),
        queuedAt,
      };
      return filename;
    });

  if (due.length === 0) {
    const changes = [];
    if (added.length) changes.push(`Queue ${added.length} scheduled tweet(s)`);
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

  // claim them all up front, so a crash cannot cause a double publish
  const claimedAt = now.toISOString();
  due.forEach(({ filename, schedule }) => {
    ledger.entries[filename] = {
      ...ledger.entries[filename],
      status: "publishing",
      scheduled: schedule.toISOString(),
      claimedAt,
    };
  });
  ledger = await writeLedger(
    state,
    ledger,
    `Claim ${due.length} scheduled tweet(s)`
  );

  const errors = [];
  for (const item of due) {
    const entry = ledger.entries[item.filename];
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
    } catch (error) {
      const failure = Array.isArray(error) ? error[0] : error;
      toolkit.error(inspect(failure));
      entry.status = "failed";
      entry.failedAt = new Date().toISOString();
      entry.error = formatError(failure);
      errors.push(`${item.filename}: ${entry.error}`);
    }
  }

  // record the outcome; retry on conflict so results are never lost
  await updateWithRetry(
    state,
    ledger,
    `Publish ${due.length} scheduled tweet(s)`
  );

  if (errors.length) {
    return toolkit.setFailed(
      `Error publishing scheduled tweets:\n- ${errors.join("\n- ")}\n\n` +
        `Fix the tweet and remove its entry from ${LEDGER_PATH} to try again.`
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
