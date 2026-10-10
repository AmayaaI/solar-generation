jest.mock('node:dns', () => ({ setServers: jest.fn() }));
jest.mock('mongoose', () => ({ connect: jest.fn() }));

const dns = require('node:dns');
const mongoose = require('mongoose');
const { config } = require('../src/config/env');
const { connectDatabase } = require('../src/config/database');

test('applies the configured DNS resolver before connecting to MongoDB', async () => {
  const originalDnsServers = config.dnsServers;
  const sequence = [];
  config.dnsServers = ['203.0.113.53'];
  dns.setServers.mockImplementation(() => sequence.push('dns'));
  mongoose.connect.mockImplementation(async () => sequence.push('mongo'));

  try {
    await connectDatabase('mongodb+srv://example.mongodb.net/test');
    expect(dns.setServers).toHaveBeenCalledWith(['203.0.113.53']);
    expect(sequence).toEqual(['dns', 'mongo']);
  } finally {
    config.dnsServers = originalDnsServers;
  }
});
