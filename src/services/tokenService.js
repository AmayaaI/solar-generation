const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const SolarInstallation = require('../models/solarInstallation');
const AppError = require('../utils/appError');
const { config } = require('../config/env');

async function issueToken(credentials) {
  if (credentials.clientType === 'installation') {
    const installation = await SolarInstallation.findOne({ meterId: String(credentials.meterId).trim().toUpperCase() }).select('+deviceSecretHash');
    if (!installation || !(await bcrypt.compare(credentials.secret, installation.deviceSecretHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The supplied credentials are invalid.');
    }
    const payload = {
      sub: String(installation._id),
      clientType: 'installation',
      installationId: String(installation._id),
      scopes: ['installation-write']
    };
    return { accessToken: jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtTtl }), tokenType: 'Bearer', expiresIn: config.jwtTtl };
  }

  const user = await User.findOne({ email: String(credentials.email).trim().toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The supplied credentials are invalid.');
  }
  const scopes = ['analyst-read'];
  if (user.managementEnabled) scopes.push('resource:manage');
  const payload = {
    sub: String(user._id),
    clientType: 'user',
    role: user.role,
    provinceId: user.provinceId ? String(user.provinceId) : undefined,
    districtId: user.districtId ? String(user.districtId) : undefined,
    scopes
  };
  return { accessToken: jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtTtl }), tokenType: 'Bearer', expiresIn: config.jwtTtl };
}

module.exports = { issueToken };
