module.exports = lookupTweet;
module.exports.syndicationToken = syndicationToken;

const https = require("https");

// X's syndication endpoint (used by embedded timelines and the react-tweet
// library) returns public post data without API credentials. The token is
// derived from the id; this is the same derivation react-tweet uses.
// It is not officially documented, so callers must treat failures as
// "unknown" rather than "invalid".
const SYNDICATION_HOST = "cdn.syndication.twimg.com";

function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

function getJson(url, timeout) {
  return new Promise((resolve, reject) => {
    let timer;
    const done = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    resolve = done(resolve);
    reject = done(reject);
    const req = https.get(
      url,
      { headers: { "user-agent": "twitter-together" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 404) return resolve(null);
          if (res.statusCode !== 200)
            return reject(
              new Error(`Lookup failed with status ${res.statusCode}`)
            );
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    timer = setTimeout(
      () => req.destroy(new Error("Lookup timed out")),
      timeout
    );
  });
}

/**
 * Look up a public post by id.
 *
 * @returns {Promise<null | { id: string, username: string, text: string, mentions: string[] }>}
 *   `null` if the post does not exist (deleted, protected or never existed).
 * @throws on network / unexpected errors
 */
async function lookupTweet(id, { timeout = 10000 } = {}) {
  const url = `https://${SYNDICATION_HOST}/tweet-result?id=${encodeURIComponent(
    id
  )}&token=${syndicationToken(id)}`;

  const data = await getJson(url, timeout);

  // deleted / protected posts come back as a tombstone or an empty object
  if (!data || data.__typename !== "Tweet" || !data.user) return null;

  return {
    id: data.id_str || String(id),
    username: data.user.screen_name,
    text: data.text || "",
    mentions: ((data.entities && data.entities.user_mentions) || [])
      .map((mention) => mention.screen_name)
      .filter(Boolean),
  };
}
