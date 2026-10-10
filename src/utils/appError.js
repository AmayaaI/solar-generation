class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = AppError;
