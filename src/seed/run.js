require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const Province = require('../models/province');
const District = require('../models/district');
const GridSubstation = require('../models/gridSubstation');
const SolarInstallation = require('../models/solarInstallation');
const GenerationReading = require('../models/generationReading');
const User = require('../models/user');
const { provinces, objectIdFor, generatedPower, timestampFor, deriveDeviceSecret } = require('./dataset');

const BATCH_SIZE = 5000;
const HOURS_PER_WEEK = 7 * 24;
const READING_COUNT = HOURS_PER_WEEK * 4;
const READING_INTERVAL_MS = 15 * 60 * 1000;
const SEED_STATE_ID = 'slsea-solar-generation-api';

function needSecret(name, minimum = 16) {
  const value = process.env[name];
  if (!value || value.length < minimum || Buffer.byteLength(value, 'utf8') > 72) throw new Error(`${name} must contain ${minimum} to 72 UTF-8 bytes before seeding.`);
  return value;
}

async function upsertDocuments(model, documents) {
  for (let offset = 0; offset < documents.length; offset += BATCH_SIZE) {
    const batch = documents.slice(offset, offset + BATCH_SIZE);
    await model.bulkWrite(batch.map(document => ({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: Object.fromEntries(Object.entries(document).filter(([key]) => key !== '_id')) },
        upsert: true
      }
    })), { ordered: false });
  }
}

async function resolveSeedEndAt() {
  const seedState = mongoose.connection.collection('_seed_state');
  if (process.env.SEED_END_AT) {
    const configuredEndAt = new Date(process.env.SEED_END_AT);
    if (Number.isNaN(configuredEndAt.getTime())) throw new Error('SEED_END_AT must be an ISO 8601 timestamp.');
    await seedState.updateOne({ _id: SEED_STATE_ID }, { $set: { endAt: configuredEndAt } }, { upsert: true });
    return configuredEndAt;
  }

  const storedState = await seedState.findOne({ _id: SEED_STATE_ID });
  if (storedState?.endAt) {
    const storedEndAt = new Date(storedState.endAt);
    if (Number.isNaN(storedEndAt.getTime())) throw new Error('Stored seed timestamp is invalid; set SEED_END_AT to a valid ISO 8601 timestamp.');
    return storedEndAt;
  }

  // Continue an older partial seed by deriving its planned end from the first
  // interval. Record the anchor before writing data so a failed run can retry.
  const firstInstallation = await SolarInstallation.findOne({ meterId: 'SLSEA-0001' }).select('_id').lean();
  const firstReading = firstInstallation && await GenerationReading.findOne({ installationId: firstInstallation._id }).sort({ timestamp: 1 }).select('timestamp').lean();
  const endAt = firstReading
    ? new Date(firstReading.timestamp.getTime() + (READING_COUNT - 1) * READING_INTERVAL_MS)
    : new Date(Math.floor(Date.now() / READING_INTERVAL_MS) * READING_INTERVAL_MS);
  await seedState.updateOne({ _id: SEED_STATE_ID }, { $setOnInsert: { endAt } }, { upsert: true });
  const resolvedState = await seedState.findOne({ _id: SEED_STATE_ID });
  const resolvedEndAt = new Date(resolvedState.endAt);
  if (Number.isNaN(resolvedEndAt.getTime())) throw new Error('Stored seed timestamp is invalid; set SEED_END_AT to a valid ISO 8601 timestamp.');
  return resolvedEndAt;
}

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI must be configured.');
  const passwords = {
    admin: needSecret('SEED_ADMIN_PASSWORD'),
    national: needSecret('SEED_NATIONAL_PASSWORD'),
    province: needSecret('SEED_PROVINCE_PASSWORD'),
    districtA: needSecret('SEED_DISTRICT_A_PASSWORD'),
    districtB: needSecret('SEED_DISTRICT_B_PASSWORD'),
    device: needSecret('SEED_DEVICE_SECRET', 32)
  };
  await connectDatabase(mongoUri);
  const models = [Province, District, GridSubstation, SolarInstallation, GenerationReading, User];
  for (const model of models) await model.createIndexes();
  const endAt = await resolveSeedEndAt();
  console.log(`Seed window ends at ${endAt.toISOString()}.`);

  const provinceDocs = provinces.map(province => ({
    _id: objectIdFor(`province:${province.code}`), name: province.name, code: province.code,
    createdAt: endAt, updatedAt: endAt, version: 0
  }));
  await upsertDocuments(Province, provinceDocs);

  const districtDocs = [];
  for (const province of provinces) {
    for (const name of province.districts) {
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
      districtDocs.push({
        _id: objectIdFor(`district:${code}`), name, code,
        provinceId: objectIdFor(`province:${province.code}`), createdAt: endAt, updatedAt: endAt, version: 0
      });
    }
  }
  await upsertDocuments(District, districtDocs);

  const substationDocs = districtDocs.map((district, index) => ({
    _id: objectIdFor(`substation:${district.code}:GS01`),
    name: `${district.name} Grid Substation`, code: `${district.code}-GS01`, districtId: district._id,
    createdAt: endAt, updatedAt: endAt, version: 0
  }));
  await upsertDocuments(GridSubstation, substationDocs);

  const installationDocs = [];
  let installationIndex = 0;
  for (const substation of substationDocs) {
    for (let meter = 1; meter <= 8; meter += 1) {
      installationIndex += 1;
      installationDocs.push({
        _id: objectIdFor(`installation:${substation.code}:${meter}`),
        meterId: `SLSEA-${String(installationIndex).padStart(4, '0')}`,
        substationId: substation._id,
        capacityKw: Number((3 + ((installationIndex * 7) % 180) / 10).toFixed(1)),
        deviceSecretHash: await bcrypt.hash(deriveDeviceSecret(passwords.device, `SLSEA-${String(installationIndex).padStart(4, '0')}`), 10),
        createdAt: endAt, updatedAt: endAt, version: 0
      });
    }
  }
  await upsertDocuments(SolarInstallation, installationDocs);

  const readingOps = [];
  for (let installIndex = 0; installIndex < installationDocs.length; installIndex += 1) {
    const installation = installationDocs[installIndex];
    let energy = 500 + installIndex * 17;
    const baseTimestamp = timestampFor(endAt, 0, READING_COUNT);
    for (let interval = 0; interval < READING_COUNT; interval += 1) {
      const timestamp = timestampFor(endAt, interval, READING_COUNT);
      const localHour = (timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60 + 5.5) % 24;
      const power = generatedPower(installation.capacityKw, localHour, installIndex, interval);
      energy = Number((energy + power * 0.25).toFixed(4));
      const id = objectIdFor(`reading:${installation._id}:${timestamp.toISOString()}`);
      const voltage = Number((228 + 7 * Math.sin(installIndex * 0.7 + interval * 0.11)).toFixed(1));
      const row = {
        _id: id, installationId: installation._id, timestamp,
        instantaneousPowerKw: power, cumulativeEnergyKwh: energy, voltage,
        createdAt: timestamp
      };
      readingOps.push({ updateOne: { filter: { _id: id }, update: { $set: row }, upsert: true } });
      if (readingOps.length >= BATCH_SIZE) {
        await GenerationReading.bulkWrite(readingOps.splice(0, readingOps.length), { ordered: false });
      }
    }
    if (installIndex === 0) console.log(`Prepared readings from ${baseTimestamp.toISOString()} through ${endAt.toISOString()}.`);
  }
  if (readingOps.length) await GenerationReading.bulkWrite(readingOps, { ordered: false });

  const districtByName = new Map(districtDocs.map(item => [item.name, item]));
  const adminHash = await bcrypt.hash(passwords.admin, 12);
  const nationalHash = await bcrypt.hash(passwords.national, 12);
  const provinceHash = await bcrypt.hash(passwords.province, 12);
  const districtAHash = await bcrypt.hash(passwords.districtA, 12);
  const districtBHash = await bcrypt.hash(passwords.districtB, 12);
  const userDocs = [
    { _id: objectIdFor('user:admin'), email: 'api-admin@slsea.example.com', passwordHash: adminHash, role: 'national', provinceId: null, districtId: null, managementEnabled: true },
    { _id: objectIdFor('user:national'), email: 'analyst.national@slsea.example.com', passwordHash: nationalHash, role: 'national', provinceId: null, districtId: null, managementEnabled: false },
    { _id: objectIdFor('user:province'), email: 'analyst.western@slsea.example.com', passwordHash: provinceHash, role: 'province', provinceId: objectIdFor('province:WST'), districtId: null, managementEnabled: false },
    { _id: objectIdFor('user:district:colombo'), email: 'analyst.colombo@slsea.example.com', passwordHash: districtAHash, role: 'district', provinceId: null, districtId: districtByName.get('Colombo')._id, managementEnabled: false },
    { _id: objectIdFor('user:district:kandy'), email: 'analyst.kandy@slsea.example.com', passwordHash: districtBHash, role: 'district', provinceId: null, districtId: districtByName.get('Kandy')._id, managementEnabled: false }
  ].map(user => ({ ...user, createdAt: endAt, updatedAt: endAt }));
  await upsertDocuments(User, userDocs);

  const counts = await Promise.all(models.map(model => model.countDocuments()));
  console.log('Seed complete:', Object.fromEntries(models.map((model, index) => [model.modelName, counts[index]])));
  console.log('Demo identities: api-admin, national analyst, Western analyst, Colombo analyst, Kandy analyst, and 200 installation meters. Passwords were read from environment variables and were not printed.');
}

if (require.main === module) {
  seed().catch(error => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  }).finally(async () => {
    await disconnectDatabase();
  });
}

module.exports = { seed, resolveSeedEndAt };
