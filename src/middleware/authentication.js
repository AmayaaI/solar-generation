const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const AppError = require('../utils/appError');

function authenticateJWT(req, res, next) {
  const authorization = req.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer token is required.'));
  }
  try {
    req.auth = jwt.verify(authorization.slice(7).trim(), config.jwtSecret, { algorithms: ['HS256'] });
    return next();
  } catch {
    return next(new AppError(401, 'INVALID_TOKEN', 'The bearer token is invalid or expired.'));
  }
}

function requireScope(scope) {
  return function scopeGuard(req, res, next) {
    if (!req.auth || !Array.isArray(req.auth.scopes) || !req.auth.scopes.includes(scope)) {
      return next(new AppError(403, 'INSUFFICIENT_SCOPE', 'The authenticated client does not have the required scope.'));
    }
    return next();
  };
}

function requireClientType(type) {
  return function clientTypeGuard(req, res, next) {
    if (!req.auth || req.auth.clientType !== type) {
      return next(new AppError(403, 'CLIENT_TYPE_FORBIDDEN', 'This client type cannot perform the requested operation.'));
    }
    return next();
  };
}

module.exports = { authenticateJWT, requireScope, requireClientType };
