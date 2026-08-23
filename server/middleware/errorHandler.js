/* =============================================================
   NovaCart — central error handler
   -------------------------------------------------------------
   Every thrown error ends up here and leaves as JSON. Expected
   errors (ApiError) keep their message; anything unexpected is
   logged in full and reported as a generic 500, so internals
   never reach the client.
   ============================================================= */

const ApiError = require("../utils/ApiError");

/** Mongoose ValidationError -> the same shape express-validator produces. */
function fromMongooseValidation(error) {
  const errors = Object.values(error.errors).map((e) => ({
    field: e.path,
    message: e.message
  }));
  return ApiError.validation("Please check the highlighted fields.", errors);
}

function normalise(error) {
  if (error instanceof ApiError) { return error; }

  if (error.name === "ValidationError" && error.errors) {
    return fromMongooseValidation(error);
  }

  // Unique index violation (email already registered)
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || { field: 1 })[0];
    return ApiError.conflict(
      field === "email"
        ? "An account with this email already exists. Try signing in instead."
        : `That ${field} is already taken.`,
      { code: "DUPLICATE_KEY" }
    );
  }

  // Malformed ObjectId in a route parameter
  if (error.name === "CastError") {
    return ApiError.badRequest(`Invalid ${error.path}.`, { code: "BAD_ID" });
  }

  // Body parser rejected malformed JSON
  if (error.type === "entity.parse.failed") {
    return ApiError.badRequest("Request body is not valid JSON.", { code: "BAD_JSON" });
  }
  if (error.type === "entity.too.large") {
    return ApiError.badRequest("Request body is too large.", { code: "BODY_TOO_LARGE" });
  }

  return null;      // genuinely unexpected
}

// eslint-disable-next-line no-unused-vars -- Express needs all four parameters
function errorHandler(err, req, res, _next) {
  const known = normalise(err);

  if (!known) {
    console.error("💥  Unexpected error on", req.method, req.originalUrl);
    console.error(err);

    return res.status(500).json({
      success: false,
      error: "Something went wrong on our end. Please try again.",
      code: "INTERNAL_ERROR",
      ...(process.env.NODE_ENV !== "production" && { detail: err.message })
    });
  }

  // Expected errors are one-liners in the log — no stack noise.
  if (known.status >= 500) {
    console.error(`💥  ${known.status} on ${req.method} ${req.originalUrl}:`, known.message);
  }

  res.status(known.status).json({
    success: false,
    error: known.message,
    ...(known.code && { code: known.code }),
    ...(known.errors && { errors: known.errors })
  });
}

module.exports = errorHandler;
