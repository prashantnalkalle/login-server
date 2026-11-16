class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;

  // Return predictable JSON errors for malformed JSON and invalid input.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' }
    });
  }

  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted fields.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  // MongoDB uses code 11000 for duplicate unique-index values.
  if (error.code === 11000) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'That value is already in use.' }
    });
  }

  const status = error.status || 500;
  const message = status === 500 ? 'An unexpected error occurred.' : error.message;
  const response = {
    code: error.code || 'INTERNAL_ERROR',
    message
  };

  if (error.details) response.details = error.details;
  if (status === 500) console.error(error);

  res.status(status).json({ error: response });
}

module.exports = { HttpError, errorHandler };
