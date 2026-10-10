process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Province = require('../src/models/province');
const District = require('../src/models/district');
const GridSubstation = require('../src/models/gridSubstation');
const SolarInstallation = require('../src/models/solarInstallation');
const GenerationReading = require('../src/models/generationReading');
const User = require('../src/models/user');
const { seed, resolveSeedEndAt } = require('../src/seed/run');
const { deriveDeviceSecret } = require('../src/seed/dataset');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.SEED_END_AT = '2026-10-05T12:00:00.000Z';
  process.env.SEED_ADMIN_PASSWORD = 'admin-seed-password-123';
  process.env.SEED_NATIONAL_PASSWORD = 'national-seed-password-123';
  process.env.SEED_PROVINCE_PASSWORD = 'province-seed-password-123';
  process.env.SEED_DISTRICT_A_PASSWORD = 'colombo-seed-password-123';
  process.env.SEED_DISTRICT_B_PASSWORD = 'kandy-seed-password-123';
  process.env.SEED_DEVICE_SECRET = 'device-seed-secret-master-1234567890';
  await seed();
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('seed creates the required scale with no orphaned records', async () => {
  const [provinceCount, districtCount, substationCount, installationCount, readingCount, userCount] = await Promise.all([
    Province.countDocuments(), District.countDocuments(), GridSubstation.countDocuments(),
    SolarInstallation.countDocuments(), GenerationReading.countDocuments(), User.countDocuments()
  ]);
  expect({ provinceCount, districtCount, substationCount, installationCount, readingCount, userCount }).toEqual({
    provinceCount: 9, districtCount: 25, substationCount: 25, installationCount: 200, readingCount: 134400, userCount: 5
  });
  expect(await District.countDocuments({ provinceId: { $nin: await Province.distinct('_id') } })).toBe(0);
  expect(await GridSubstation.countDocuments({ districtId: { $nin: await District.distinct('_id') } })).toBe(0);
  expect(await SolarInstallation.countDocuments({ substationId: { $nin: await GridSubstation.distinct('_id') } })).toBe(0);
  expect(await GenerationReading.countDocuments({ installationId: { $nin: await SolarInstallation.distinct('_id') } })).toBe(0);
  const installation = await SolarInstallation.findOne({ meterId: 'SLSEA-0001' }).select('+deviceSecretHash').lean();
  expect(installation.deviceSecretHash).not.toBe(process.env.SEED_DEVICE_SECRET);
  expect(await require('bcryptjs').compare(deriveDeviceSecret(process.env.SEED_DEVICE_SECRET, 'SLSEA-0001'), installation.deviceSecretHash)).toBe(true);
  const second = await SolarInstallation.findOne({ meterId: 'SLSEA-0002' }).select('+deviceSecretHash').lean();
  expect(await require('bcryptjs').compare(deriveDeviceSecret(process.env.SEED_DEVICE_SECRET, 'SLSEA-0001'), second.deviceSecretHash)).toBe(false);
  const perInstallation = await GenerationReading.countDocuments({ installationId: installation._id });
  expect(perInstallation).toBe(672);
  delete process.env.SEED_END_AT;
  expect(await resolveSeedEndAt()).toEqual(new Date('2026-10-05T12:00:00.000Z'));
  await mongoose.connection.collection('_seed_state').deleteOne({ _id: 'slsea-solar-generation-api' });
  expect(await resolveSeedEndAt()).toEqual(new Date('2026-10-05T12:00:00.000Z'));
}, 180000);
