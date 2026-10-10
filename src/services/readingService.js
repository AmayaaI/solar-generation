const SolarInstallation = require('../models/solarInstallation');
const GenerationReading = require('../models/generationReading');
const GridSubstation = require('../models/gridSubstation');
const District = require('../models/district');
const Province = require('../models/province');
const AppError = require('../utils/appError');
const { collectionResponse } = require('../utils/pagination');
const { authorizeResource, resolveInstallationIds } = require('./accessService');

function buildTimeQuery(from, to) {
  if (from && to && new Date(from) > new Date(to)) {
    throw new AppError(400, 'INVALID_TIME_RANGE', 'The from timestamp must not be later than to.');
  }
  const timestamp = {};
  if (from) timestamp.$gte = new Date(from);
  if (to) timestamp.$lte = new Date(to);
  return Object.keys(timestamp).length ? { timestamp } : {};
}

function readingModifiedAt(rows, newestWrite) {
  const dates = rows.map(row => row.createdAt).filter(Boolean).map(value => new Date(value));
  if (newestWrite) dates.push(new Date(newestWrite));
  return dates.length ? new Date(Math.max(...dates.map(value => value.getTime()))) : new Date(0);
}

async function getInstallation(installationId, auth) {
  const installation = await SolarInstallation.findById(installationId).lean();
  if (!installation) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Solar installation was not found.');
  await authorizeResource('installation', installation, auth);
  return installation;
}

async function getLatest(installationId) {
  return GenerationReading.findOne({ installationId }).sort({ timestamp: -1, _id: -1 }).lean();
}

async function listForInstallation(req, auth) {
  const installation = await getInstallation(req.params.installationId, auth);
  const { from, to, page, limit, sort } = req.validatedQuery || req.query;
  const timeQuery = buildTimeQuery(from, to);
  const criteria = { installationId: installation._id, ...timeQuery };
  const direction = sort === 'timestamp' ? 1 : -1;
  const [data, totalCount, newestWrite] = await Promise.all([
    GenerationReading.find(criteria).sort({ timestamp: direction, _id: direction }).skip((page - 1) * limit).limit(limit).lean(),
    GenerationReading.countDocuments(criteria),
    GenerationReading.findOne(criteria).sort({ createdAt: -1 }).select('createdAt').lean()
  ]);
  const payload = collectionResponse(req, page, limit, totalCount, data);
  return { payload, modifiedAt: readingModifiedAt(data, newestWrite && newestWrite.createdAt) };
}

async function listGlobal(req, auth) {
  const q = req.validatedQuery || req.query;
  const filters = {
    provinceId: q['province-id'],
    districtId: q['district-id'],
    substationId: q['substation-id'],
    installationId: q['installation-id']
  };
  const installationIds = await resolveInstallationIds(filters, auth);
  const timeQuery = buildTimeQuery(q.from, q.to);
  const criteria = { installationId: { $in: installationIds }, ...timeQuery };
  const direction = q.sort === 'timestamp' ? 1 : -1;
  const [data, totalCount, newestWrite] = await Promise.all([
    GenerationReading.find(criteria).sort({ timestamp: direction, _id: direction }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    GenerationReading.countDocuments(criteria),
    GenerationReading.findOne(criteria).sort({ createdAt: -1 }).select('createdAt').lean()
  ]);
  const payload = collectionResponse(req, q.page, q.limit, totalCount, data);
  return { payload, modifiedAt: readingModifiedAt(data, newestWrite && newestWrite.createdAt) };
}

async function getReading(installationId, readingId, auth) {
  const installation = await getInstallation(installationId, auth);
  const reading = await GenerationReading.findOne({ _id: readingId, installationId: installation._id }).lean();
  if (!reading) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Generation reading was not found.');
  return reading;
}

async function ingest(installationId, auth, body) {
  if (auth.clientType !== 'installation' || auth.installationId !== installationId) {
    throw new AppError(403, 'INSTALLATION_OWNERSHIP_REQUIRED', 'An installation may submit readings only for itself.');
  }
  const installation = await SolarInstallation.findById(installationId).select('+deviceSecretHash').lean();
  if (!installation) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Solar installation was not found.');
  if (body.instantaneousPowerKw > installation.capacityKw) {
    throw new AppError(400, 'POWER_EXCEEDS_CAPACITY', 'Instantaneous power cannot exceed the installation capacity.');
  }
  const timestamp = new Date(body.timestamp);
  if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new AppError(400, 'FUTURE_READING', 'A reading timestamp cannot be more than five minutes in the future.');
  }
  const previous = await GenerationReading.findOne({ installationId }).sort({ timestamp: -1 }).lean();
  if (previous && timestamp <= previous.timestamp) {
    throw new AppError(409, 'NON_MONOTONIC_TIMESTAMP', 'Readings must be appended in increasing timestamp order.');
  }
  if (previous && body.cumulativeEnergyKwh < previous.cumulativeEnergyKwh) {
    throw new AppError(400, 'ENERGY_COUNTER_DECREASED', 'Cumulative energy must not decrease.');
  }
  try {
    return await GenerationReading.create({ ...body, timestamp, installationId });
  } catch (error) {
    if (error.code === 11000) throw new AppError(409, 'DUPLICATE_READING', 'A reading already exists for this installation and timestamp.');
    throw error;
  }
}

async function overview(installationId, auth) {
  const installation = await getInstallation(installationId, auth);
  const substation = await GridSubstation.findById(installation.substationId).lean();
  if (!substation) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Grid substation was not found.');
  const district = await District.findById(substation.districtId).lean();
  if (!district) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'District was not found.');
  const province = await Province.findById(district.provinceId).lean();
  if (!province) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Province was not found.');
  const lastKnownReading = await getLatest(installation._id);
  const modifiedAt = [installation.updatedAt, substation.updatedAt, district.updatedAt, province.updatedAt, lastKnownReading && lastKnownReading.createdAt]
    .filter(Boolean).map(value => new Date(value)).sort((a, b) => b - a)[0] || new Date(0);
  const safeInstallation = { ...installation };
  delete safeInstallation.deviceSecretHash;
  return { value: { installation: safeInstallation, substation, district, province, lastKnownReading }, modifiedAt };
}

module.exports = { getInstallation, getLatest, listForInstallation, listGlobal, getReading, ingest, overview };
