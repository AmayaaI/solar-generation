const GenerationReading = require('../models/generationReading');
const SolarInstallation = require('../models/solarInstallation');
const GridSubstation = require('../models/gridSubstation');
const District = require('../models/district');
const AppError = require('../utils/appError');
const { authorizeResource } = require('./accessService');
const { config } = require('../config/env');

function startOfColomboDay(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
}

async function generationSummary(districtId, auth) {
  const district = await District.findById(districtId).lean();
  if (!district) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'District was not found.');
  await authorizeResource('district', district, auth);
  const substations = await GridSubstation.find({ districtId }).select('_id').lean();
  const installations = await SolarInstallation.find({ substationId: { $in: substations.map(item => item._id) } }).select('_id').lean();
  const installationIds = installations.map(item => item._id);
  const now = new Date();
  const todayStart = startOfColomboDay(now);

  const latestByInstallation = await GenerationReading.aggregate([
    { $match: { installationId: { $in: installationIds }, timestamp: { $lte: now } } },
    { $sort: { installationId: 1, timestamp: 1 } },
    { $group: { _id: '$installationId', reading: { $last: '$$ROOT' } } }
  ]);
  const previousDayCounters = await GenerationReading.aggregate([
    { $match: { installationId: { $in: installationIds }, timestamp: { $lt: todayStart } } },
    { $sort: { installationId: 1, timestamp: -1 } },
    { $group: { _id: '$installationId', energy: { $first: '$cumulativeEnergyKwh' } } }
  ]);
  const todayCounters = await GenerationReading.aggregate([
    { $match: { installationId: { $in: installationIds }, timestamp: { $gte: todayStart, $lte: now } } },
    { $sort: { installationId: 1, timestamp: -1 } },
    { $group: { _id: '$installationId', energy: { $first: '$cumulativeEnergyKwh' } } }
  ]);

  const latestDate = latestByInstallation.map(item => item.reading.timestamp).sort((a, b) => b - a)[0] || null;
  const reportingThreshold = new Date(now.getTime() - config.currentReadingMaxAgeMinutes * 60 * 1000);
  const reporting = latestByInstallation.filter(item => item.reading.timestamp >= reportingThreshold);
  const baselines = new Map(previousDayCounters.map(item => [String(item._id), item.energy]));
  const endCounters = new Map(todayCounters.map(item => [String(item._id), item.energy]));
  let todayTotalEnergyKwh = 0;
  let energyCoverageCount = 0;
  for (const [id, end] of endCounters) {
    if (baselines.has(id)) {
      todayTotalEnergyKwh += Math.max(0, end - baselines.get(id));
      energyCoverageCount += 1;
    }
  }

  const value = {
    districtId: String(districtId),
    timestamp: latestDate,
    installationCount: installationIds.length,
    reportingInstallationCount: reporting.length,
    currentTotalPowerKw: Number(reporting.reduce((sum, item) => sum + item.reading.instantaneousPowerKw, 0).toFixed(3)),
    todayTotalEnergyKwh: Number(todayTotalEnergyKwh.toFixed(3)),
    energyCoverageCount
  };
  // The response depends on the current time because readings age out of the
  // reporting window even when MongoDB receives no new writes.
  return { value, modifiedAt: now };
}

module.exports = { generationSummary, startOfColomboDay };
