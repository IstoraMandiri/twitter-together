module.exports = generateSummary;

const { autoLink } = require("twitter-text");

const parseTweetFileContent = require("../common/parse-tweet-file-content");
const checkReferences = require("../common/check-references");
const getNewTweets = require("./get-new-tweets");

async function generateSummary(state, plainText = false) {
  const { payload, dir } = state;

  const newTweets = await getNewTweets(state);

  // when the posting account is known, verify referenced posts exist and
  // that X will let the account reply to / quote them
  const account = (process.env.TWITTER_ACCOUNT || "").replace(/^@/, "");

  const parsedTweets = [];
  for (const tweet of newTweets) {
    try {
      const parsed = parseTweetFileContent(tweet, dir);
      if (account) {
        const { errors, warnings } = await checkReferences(parsed, account);
        parsed.warnings = warnings;
        if (errors.length) {
          parsedTweets.push({
            error: errors.join("\n\n"),
            valid: false,
            text: tweet,
          });
          continue;
        }
      }
      parsedTweets.push(parsed);
    } catch (error) {
      parsedTweets.push({
        error: error.message,
        valid: false,
        text: tweet,
      });
    }
  }

  return {
    count: parsedTweets.length,
    valid: parsedTweets.every((tweet) => tweet.valid),
    title: `## Found ${parsedTweets.length} new \`.tweet\` file(s)\n\n`,
    body: parsedTweets
      .map((tweet) => summarizeTweet({ tweet, payload, dir, plainText }))
      .join("\n\n---\n\n"),
  };
}

function summarizeTweet(state, threading = false) {
  const { tweet, payload, dir, plainText } = state;

  if (!tweet.valid)
    return `### ❌ Invalid Tweet\n\n\`\`\`tweet\n${tweet.text}\n\`\`\`\n\n**${
      tweet.error || "Unknown error"
    }**`;

  let text = !tweet.text
    ? ""
    : autoLink(tweet.text)
        .replace(/(^|\n)/g, "$1> ")
        .replace(/(^|\n)> (\n|$)/g, "$1>$2");

  if (tweet.poll) text = `- ${tweet.poll.join("\n- ")}\n\n${text}`;

  if (tweet.reply) text = `Replying to ${tweet.reply}\n\n${text}`;

  if (tweet.retweet)
    text = `${tweet.text ? "Quoting" : "Retweeting"} ${
      tweet.retweet
    }\n\n${text}`.trim();

  if (tweet.media.length) {
    const media = tweet.media
      .map(({ file, alt }) => {
        const fileName = file.replace(dir, "");
        if (plainText) {
          return `- ${fileName}${alt && ` [${alt}]`}`;
        } else {
          const { repo, sha } = payload.pull_request.head;
          return `${alt || ""}\n<img src="https://raw.githubusercontent.com/${
            repo.owner.login
          }/${repo.name}/${sha}${fileName}" height="200" />`;
        }
      })
      .join(plainText ? "\n" : "\n\n");
    text = `${media}\n\n${text}`.trim();
  }

  if (!threading && tweet.schedule)
    text = `📅 Scheduled for ${tweet.schedule.toISOString()}\n\n${text}`.trim();

  if (!threading && tweet.warnings && tweet.warnings.length)
    text = `${text}\n\n${tweet.warnings
      .map((warning) => `> ⚠️ ${warning}`)
      .join("\n")}`.trim();

  if (tweet.thread || threading) {
    const count = threading ? threading + 1 : 1;
    let thread = `\n\n#### --- 🧵 ${count} ---\n\n${text}`;
    if (tweet.thread)
      thread += summarizeTweet({ ...state, tweet: tweet.thread }, count);
    return threading ? thread : `### ✅ Valid Thread${thread}`;
  }

  return `### ✅ Valid Tweet\n\n${text}`;
}
