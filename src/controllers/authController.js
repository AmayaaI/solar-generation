const { issueToken } = require('../services/tokenService');
const asyncHandler = require('../utils/asyncHandler');

const createToken = asyncHandler(async (req, res) => {
  const value = await issueToken(req.body);
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(value);
});

module.exports = { createToken };
