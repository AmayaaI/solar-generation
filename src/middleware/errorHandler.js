const AppError = require('../utils/appError');

function notFound(req, res, next) {
  next(new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let normalized = error;
  if (error && error.status === 400 && !error.isOperational) {
    normalized = new AppError(400, 'MALFORMED_REQUEST', 'The request body is not valid JSON.');
  } else if (error && error.status === 413 && !error.isOperational) {
    normalized = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body exceeds the 1 MB limit.');
  }
  if (error && error.code === 11000) {
    normalized = new AppError(409, 'DUPLICATE_RESOURCE', 'A resource with the same unique value already exists.');
  } else if (error && error.name === 'ValidationError') {
    normalized = new AppError(400, 'VALIDATION_ERROR', 'The request contains invalid data.',
      Object.values(error.errors).map(item => ({ field: item.path, message: item.message })));
  } else if (error && error.name === 'CastError') {
    normalized = new AppError(400, 'INVALID_IDENTIFIER', 'A supplied identifier is invalid.');
  } else if (!error.isOperational) {
    if (process.env.NODE_ENV !== 'production') console.error(error);
    normalized = new AppError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
  }

  return res.status(normalized.status || 500).json({
    code: normalized.code || 'INTERNAL_ERROR',
    message: normalized.message || 'An unexpected server error occurred.',
    details: Array.isArray(normalized.details) ? normalized.details : []
  });
}

module.exports = { notFound, errorHandler };
