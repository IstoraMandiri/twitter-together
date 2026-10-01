const { extname } = require("path");

const MB = 1024 * 1024;

// X's upload limits per media kind
const MEDIA_LIMITS = {
  image: 5 * MB,
  gif: 15 * MB,
  video: 512 * MB,
};

const EXTENSIONS = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "gif",
  ".mp4": "video",
  ".m4v": "video",
};

const MEDIA_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
};

/**
 * The kind of media ("image", "gif" or "video") from a file name or URL
 * path, or `null` if the extension is not supported.
 */
function mediaKind(name) {
  return EXTENSIONS[extname(name).toLowerCase()] || null;
}

/**
 * `MEDIA_URL_HOSTS` is a comma-separated list of exact hosts,
 * `*.example.com` wildcards (subdomains only), or `*` for any host.
 */
function isAllowedHost(host, allowed = process.env.MEDIA_URL_HOSTS) {
  const hostname = String(host).toLowerCase();
  return String(allowed || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      if (entry.startsWith("*.")) return hostname.endsWith(entry.slice(1));
      return hostname === entry;
    });
}

/**
 * Validate a media URL from a tweet file. Returns `{ url, kind, mimeType }`.
 */
function checkMediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`Invalid media URL: ${value}`);
  }
  if (url.protocol !== "https:")
    throw new Error(`Media URLs must use https: ${value}`);

  if (!process.env.MEDIA_URL_HOSTS)
    throw new Error(
      `Media URLs are not enabled. Set the MEDIA_URL_HOSTS environment variable to the hosts media may be loaded from (or "*" for any host): ${value}`
    );
  if (!isAllowedHost(url.hostname))
    throw new Error(
      `Media host ${url.hostname} is not allowed. Allowed hosts are set with the MEDIA_URL_HOSTS environment variable: ${value}`
    );

  const ext = extname(url.pathname).toLowerCase();
  if (ext === ".mov")
    throw new Error(`Only MP4 videos are supported, convert ${value} to .mp4`);
  const kind = mediaKind(url.pathname);
  if (!kind)
    throw new Error(
      `Unsupported media type for ${value}. Use a link ending in .png, .jpg, .jpeg, .webp, .gif, .mp4 or .m4v`
    );
  return { url: url.href, kind, mimeType: MEDIA_MIME_TYPES[ext] };
}

/**
 * X allows up to 4 images, or a single video or GIF, per tweet.
 */
function validateMediaSet(media) {
  const single = media.filter((item) => item.kind !== "image");
  if (single.length && media.length > 1)
    throw new Error(
      "A tweet can have up to 4 images, or a single video or GIF, but not both"
    );
  if (media.length > 4)
    throw new Error(
      `A tweet can have up to 4 images, found ${media.length} images`
    );
}

/**
 * Whether a response content type is acceptable for the media kind.
 */
function contentTypeMatches(contentType, kind) {
  const type = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (kind === "video") return type === "video/mp4";
  if (kind === "gif") return type === "image/gif";
  return ["image/png", "image/jpeg", "image/webp"].includes(type);
}

module.exports = {
  mediaKind,
  isAllowedHost,
  checkMediaUrl,
  validateMediaSet,
  contentTypeMatches,
  MEDIA_LIMITS,
  MEDIA_MIME_TYPES,
};
