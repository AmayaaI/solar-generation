const dotenv = require('dotenv');
const { isIP } = require('node:net');
dotenv.config({ quiet: true });

function readEnv(name, fallback) {
  return process.env[name] === undefined ? fallback : process.env[name];
}

const config = {
  nodeEnv: readEnv('NODE_ENV', 'development'),
  port: Number(readEnv('PORT', 3000)),
  mongoUri: readEnv('MONGODB_URI', ''),
  jwtSecret: readEnv('JWT_SECRET', ''),
  jwtTtl: readEnv('JWT_TTL', '15m'),
  currentReadingMaxAgeMinutes: Number(readEnv('CURRENT_READING_MAX_AGE_MINUTES', 30)),
  dnsServers: readEnv('DNS_SERVERS', '').split(',').map(value => value.trim()).filter(Boolean),
  corsOrigins: readEnv('CORS_ORIGINS', '').split(',').map(value => value.trim()).filter(Boolean),
  trustProxy: readEnv('TRUST_PROXY', '0') === '1'
};

function assertRuntimeConfig() {
  if (!config.mongoUri) throw new Error('MONGODB_URI must be configured.');
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  if (config.dnsServers.some(address => isIP(address) === 0)) {
    throw new Error('DNS_SERVERS must be a comma-separated list of DNS server IP addresses.');
  }
  if (!Number.isInteger(config.currentReadingMaxAgeMinutes) || config.currentReadingMaxAgeMinutes < 1 || config.currentReadingMaxAgeMinutes > 1440) {
    throw new Error('CURRENT_READING_MAX_AGE_MINUTES must be an integer from 1 to 1440.');
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }
}

module.exports = { config, assertRuntimeConfig };
