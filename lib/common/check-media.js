module.exports = checkMedia;

const { headMedia, MediaError } = require("./fetch-media");

/**
 * Verify that media loaded from URLs exists and fits X's limits, for every
 * tweet of a thread. Media that is missing, of the wrong type or too big is
 * an error; media that could not be checked is a warning, as it is checked
 * again when the tweet is published.
 *
 * @param {object} parsed result of parseTweetFileContent
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
async function checkMedia(parsed) {
  const errors = [];
  const warnings = [];

  for (let tweet = parsed; tweet; tweet = tweet.thread) {
    for (const { url, kind } of tweet.media || []) {
      if (!url) continue;
      try {
        await headMedia(url, kind);
      } catch (error) {
        if (error instanceof MediaError) errors.push(error.message);
        else
          warnings.push(
            `Could not verify ${url} (${error.message}). It will be checked again when the tweet is published.`
          );
      }
    }
  }

  return { errors, warnings };
}
