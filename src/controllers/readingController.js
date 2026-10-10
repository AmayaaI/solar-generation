const readingService = require('../services/readingService');
const { generationSummary } = require('../services/summaryService');
const { sendRepresentation } = require('../utils/representation');
const { collectionResponse } = require('../utils/pagination');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

const overview = asyncHandler(async (req, res) => {
  const result = await readingService.overview(req.params.installationId, req.auth);
  return sendRepresentation(req, res, result.value, { modifiedAt: result.modifiedAt });
});

const lastKnown = asyncHandler(async (req, res) => {
  const installation = await readingService.getInstallation(req.params.installationId, req.auth);
  const reading = await readingService.getLatest(installation._id);
  if (!reading) throw new AppError(404, 'READING_NOT_FOUND', 'No generation reading exists for this installation.');
  return sendRepresentation(req, res, reading, { modifiedAt: reading.createdAt || reading.timestamp });
});

const installationHistory = asyncHandler(async (req, res) => {
  const result = await readingService.listForInstallation(req, req.auth);
  return sendRepresentation(req, res, result.payload, { modifiedAt: result.modifiedAt });
});

const globalHistory = asyncHandler(async (req, res) => {
  const result = await readingService.listGlobal(req, req.auth);
  return sendRepresentation(req, res, result.payload, { modifiedAt: result.modifiedAt });
});

const readingItem = asyncHandler(async (req, res) => {
  const value = await readingService.getReading(req.params.installationId, req.params.readingId, req.auth);
  return sendRepresentation(req, res, value, { modifiedAt: value.createdAt || value.timestamp });
});

const ingest = asyncHandler(async (req, res) => {
  const value = await readingService.ingest(req.params.installationId, req.auth, req.body);
  res.set('Location', `/api/v1/installations/${req.params.installationId}/readings/${value._id}`);
  return sendRepresentation(req, res, value.toObject ? value.toObject() : value, { status: 201, modifiedAt: value.createdAt || value.timestamp });
});

const districtSummary = asyncHandler(async (req, res) => {
  const result = await generationSummary(req.params.districtId, req.auth);
  return sendRepresentation(req, res, result.value, { modifiedAt: result.modifiedAt });
});

function hierarchyCollection() {
  return asyncHandler(async (req, res) => {
    const { listProvinces } = require('./catalogController');
    return listProvinces()(req, res);
  });
}

function unsupportedMethod(allow) {
  return function rejectMethod(req, res, next) {
    res.set('Allow', allow);
    next(new AppError(405, 'METHOD_NOT_ALLOWED', `Allowed methods for this resource: ${allow}.`));
  };
}

module.exports = { overview, lastKnown, installationHistory, globalHistory, readingItem, ingest, districtSummary, unsupportedMethod };
