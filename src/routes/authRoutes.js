const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { schemas } = require('../validators/schemas');
const { createToken } = require('../controllers/authController');
const AppError = require('../utils/appError');

const router = express.Router();
const tokenLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many token requests. Try again later.'))
});
router.post('/tokens', tokenLimit, validate(schemas.auth), createToken);

module.exports = router;
