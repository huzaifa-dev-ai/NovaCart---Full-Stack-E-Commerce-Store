/* =============================================================
   NovaCart — ApiError
   -------------------------------------------------------------
   An error carrying an HTTP status, so controllers can throw
   meaningfully and one central handler turns it into JSON.

   Anything thrown that is NOT an ApiError is treated as an
   unexpected fault: logged in full, reported as a generic 500.
   ============================================================= */

class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} message safe to show the user
   * @param {Object} [extra]
   * @param {string} [extra.code]    machine-readable code for the frontend
   * @param {Array}  [extra.errors]  field-level validation details
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.expected = true;               // distinguishes it from a crash
    if (extra.code) { this.code = extra.code; }
    if (extra.errors) { this.errors = extra.errors; }
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, extra)   { return new ApiError(400, message, extra); }
  static unauthorized(message, extra) { return new ApiError(401, message, extra); }
  static forbidden(message, extra)    { return new ApiError(403, message, extra); }
  static notFound(message, extra)     { return new ApiError(404, message, extra); }
  static conflict(message, extra)     { return new ApiError(409, message, extra); }
  static validation(message, errors)  { return new ApiError(422, message, { code: "VALIDATION_FAILED", errors }); }
  static tooMany(message, extra)      { return new ApiError(429, message, extra); }
}

module.exports = ApiError;
