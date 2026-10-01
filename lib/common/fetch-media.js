const dns = require("dns");
const fs = require("fs");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");

const { MEDIA_LIMITS, contentTypeMatches } = require("./media");

const MAX_REDIRECTS = 3;
// adjustable for tests
const settings = { timeout: 30000 };
const MB = 1024 * 1024;

/**
 * A problem with the media itself (missing, wrong type, too big), as opposed
 * to a network failure, which may go away on its own.
 */
class MediaError extends Error {}

/**
 * Whether an IP address is private, loopback, link-local, unique-local or
 * otherwise not on the public internet. Media URLs may point anywhere when
 * MEDIA_URL_HOSTS is "*", so requests must never reach internal services.
 */
function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateV4(address);
  if (version !== 6) return true;

  const ip = address.toLowerCase();
  // IPv4-mapped (::ffff:10.0.0.1) and NAT64 (64:ff9b::10.0.0.1) addresses
  const mapped = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (ip === "::" || ip === "::1") return true;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    ip.startsWith("::ffff:") // mapped addresses in hex form
  );
}

function isPrivateV4(address) {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/**
 * A `lookup` for https.request that refuses hosts resolving to private
 * addresses. Checking the address that is actually connected to (rather
 * than resolving separately up front) means DNS can't change in between.
 */
function createSafeLookup(lookup = dns.lookup) {
  return function safeLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const blocked = addresses.find(({ address }) =>
        isPrivateAddress(address)
      );
      if (blocked)
        return callback(
          new MediaError(
            `Refusing to load media from ${hostname}: it resolves to the private address ${blocked.address}`
          )
        );
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const safeLookup = createSafeLookup();

function checkUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new MediaError(`Media URLs must use https: ${value}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // IP literals are connected to without a lookup
  if (net.isIP(host) && isPrivateAddress(host))
    throw new MediaError(
      `Refusing to load media from the private address ${host}`
    );
  return url;
}

/**
 * Make a request, following up to MAX_REDIRECTS redirects and checking every
 * hop. Resolves with the response of the final hop.
 */
function request(value, method, redirects = 0) {
  return new Promise((resolve, reject) => {
    const url = checkUrl(value);
    const req = https.request(
      url,
      {
        method,
        lookup: safeLookup,
        headers: { "user-agent": "twitter-together" },
        timeout: settings.timeout,
      },
      (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS)
            return reject(
              new MediaError(`Too many redirects loading ${value}`)
            );
          const next = new URL(headers.location, url).href;
          return request(next, method, redirects + 1).then(resolve, reject);
        }
        resolve(res);
      }
    );
    req.on("timeout", () =>
      req.destroy(new Error(`Timed out loading ${value}`))
    );
    req.on("error", reject);
    req.end();
  });
}

function checkResponse(res, url, kind) {
  if (res.statusCode === 404 || res.statusCode === 410)
    throw new MediaError(`Media ${url} does not exist`);
  if (res.statusCode < 200 || res.statusCode >= 300)
    throw new Error(
      `Loading media ${url} failed with status ${res.statusCode}`
    );

  const contentType = res.headers["content-type"] || "";
  if (!contentTypeMatches(contentType, kind))
    throw new MediaError(
      `Media ${url} has content type "${contentType}", which is not a supported ${kind}`
    );

  const length = res.headers["content-length"];
  const size = length === undefined ? null : Number(length);
  const limit = MEDIA_LIMITS[kind];
  if (size !== null && size > limit)
    throw new MediaError(tooBig(url, kind, size));
  return { contentType, size };
}

function tooBig(url, kind, size) {
  const limit = MEDIA_LIMITS[kind];
  const found = size ? ` (${(size / MB).toFixed(1)}MB)` : "";
  return `Media ${url} is too big${found}, X allows up to ${
    limit / MB
  }MB for a ${kind}`;
}

/**
 * Check that media exists and fits X's limits without downloading it.
 * Throws a MediaError if the media is unusable, any other error if it could
 * not be checked.
 */
async function headMedia(url, kind) {
  let res = await request(url, "HEAD");
  res.resume();
  // some servers don't implement HEAD, look at the headers of a GET instead
  if (res.statusCode === 405 || res.statusCode === 501) {
    res = await request(url, "GET");
    res.destroy();
  }
  return checkResponse(res, url, kind);
}

/**
 * Download media to a temporary file, aborting once it exceeds X's limit
 * for its kind. Call `cleanup()` once done with the file.
 */
async function downloadMedia(url, kind) {
  const res = await request(url, "GET");
  try {
    checkResponse(res, url, kind);
  } catch (error) {
    res.destroy();
    throw error;
  }

  const dir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "twitter-together-")
  );
  const cleanup = () => fs.promises.rm(dir, { recursive: true, force: true });
  const file = path.join(dir, path.basename(new URL(url).pathname));
  const limit = MEDIA_LIMITS[kind];

  try {
    const size = await new Promise((resolve, reject) => {
      let received = 0;
      const out = fs.createWriteStream(file);
      res.on("data", (chunk) => {
        received += chunk.length;
        if (received > limit) {
          res.destroy();
          out.destroy();
          reject(new MediaError(tooBig(url, kind, received)));
        }
      });
      res.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve(received));
      res.pipe(out);
    });
    return { file, size, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

module.exports = {
  headMedia,
  downloadMedia,
  createSafeLookup,
  isPrivateAddress,
  MediaError,
  settings,
};
