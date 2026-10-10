const mongoose = require('mongoose');
const dns = require('node:dns');
const { config } = require('./env');

async function connectDatabase(uri) {
  if (config.dnsServers.length) dns.setServers(config.dnsServers);
  await mongoose.connect(uri, {
    autoIndex: process.env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 10000
  });
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
