/* =============================================================
   NovaCart — payment hash utilities
   -------------------------------------------------------------
   HMAC-SHA256 signing and verification for Easypaisa gateway
   requests. All hashing runs server-side so the hash key is
   never exposed to the browser.
   ============================================================= */

const crypto = require("crypto");

/* ---------- Easypaisa ---------- */

/**
 * Build an Easypaisa hash.
 *
 * Easypaisa concatenates specific fields in a fixed order and HMAC-SHA256
 * signs them with the merchant hash key.
 *
 * @param {Object} params   Key-value pairs for the Easypaisa request.
 * @param {string} hashKey  The merchant's hash key.
 * @returns {string}        Hex-encoded hash.
 */
function generateEasypaisaHash(params, hashKey) {
  // Easypaisa requires concatenation in this exact order.
  const fields = [
    "amount",
    "orderRefNum",
    "paymentMethod",
    "postBackURL",
    "storeId"
  ];

  const message = fields
    .map((f) => (params[f] != null ? String(params[f]) : ""))
    .join("&");

  return crypto
    .createHmac("sha256", hashKey)
    .update(message)
    .digest("hex")
    .toUpperCase();
}

/**
 * Verify an Easypaisa callback hash.
 *
 * @param {Object} responseParams  The full POST body from Easypaisa callback.
 * @param {string} hashKey         The merchant's hash key.
 * @returns {boolean}
 */
function verifyEasypaisaHash(responseParams, hashKey) {
  const received = String(
    responseParams.encryptedHashRequest || responseParams.hash || ""
  ).toUpperCase();
  if (!received) return false;

  // Recompute from response fields
  const params = { ...responseParams };
  delete params.encryptedHashRequest;
  delete params.hash;

  const expected = generateEasypaisaHash(params, hashKey);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

module.exports = {
  generateEasypaisaHash,
  verifyEasypaisaHash
};
