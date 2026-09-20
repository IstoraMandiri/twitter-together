module.exports = formatError;

/**
 * Turn an error thrown by twitter-api-v2 (or anything else) into a message
 * that includes the detail X sends back, e.g.
 *   Request failed with code 403: You can only reply to or quote posts where you are mentioned or are the author.
 */
function formatError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;

  const parts = [error.message || String(error)];
  const data = error.data;

  if (data && typeof data === "object") {
    if (data.detail) parts.push(data.detail);
    else if (data.title) parts.push(data.title);
    if (Array.isArray(data.errors)) {
      data.errors.forEach((item) => {
        if (item && item.message) parts.push(item.message);
      });
    }
  }

  return parts.filter(Boolean).join(": ");
}
