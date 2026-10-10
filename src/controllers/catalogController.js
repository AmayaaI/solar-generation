const catalogService = require('../services/catalogService');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { sendRepresentation, assertIfMatch } = require('../utils/representation');
const { collectionResponse } = require('../utils/pagination');

function mostRecent(values) {
  const dates = values.map(item => item.updatedAt || item.createdAt).filter(Boolean).map(value => new Date(value));
  return dates.length ? new Date(Math.max(...dates.map(value => value.getTime()))) : new Date(0);
}

function paginate(req, values) {
  const { page, limit } = req.validatedQuery || req.query;
  return collectionResponse(req, page, limit, values.length, values.slice((page - 1) * limit, page * limit));
}

function listProvinces() {
  return asyncHandler(async (req, res) => {
    const values = await catalogService.listProvinces(req.auth);
    const payload = paginate(req, values);
    return sendRepresentation(req, res, payload, { modifiedAt: mostRecent(values) });
  });
}

function listChildren(type) {
  return asyncHandler(async (req, res) => {
    const parentParam = { district: 'provinceId', substation: 'districtId', installation: 'substationId' }[type];
    const parentId = req.params[parentParam];
    const values = await catalogService.getChildren(type, parentId, req.auth);
    const payload = paginate(req, values);
    return sendRepresentation(req, res, payload, { modifiedAt: mostRecent(values) });
  });
}

function getOne(type, param) {
  return asyncHandler(async (req, res) => {
    const value = await catalogService.get(type, req.params[param], req.auth);
    return sendRepresentation(req, res, value, { modifiedAt: catalogService.modifiedAtOf(value) });
  });
}

function locationFor(type, id) {
  const paths = {
    province: `/api/v1/provinces/${id}`,
    district: `/api/v1/districts/${id}`,
    substation: `/api/v1/grid-substations/${id}`,
    installation: `/api/v1/installations/${id}`
  };
  return paths[type];
}

function create(type, parentParam) {
  return asyncHandler(async (req, res) => {
    const parentId = parentParam ? req.params[parentParam] : undefined;
    const value = await catalogService.create(type, req.body, parentId);
    res.set('Location', locationFor(type, value._id));
    return sendRepresentation(req, res, value, { status: 201, modifiedAt: catalogService.modifiedAtOf(value) });
  });
}

function replace(type, param) {
  return asyncHandler(async (req, res) => {
    const value = await catalogService.replace(type, req.params[param], req.body, current => assertIfMatch(req, current));
    return sendRepresentation(req, res, value, { modifiedAt: catalogService.modifiedAtOf(value) });
  });
}

function patch(type, param) {
  return asyncHandler(async (req, res) => {
    const value = await catalogService.patch(type, req.params[param], req.body, current => assertIfMatch(req, current));
    return sendRepresentation(req, res, value, { modifiedAt: catalogService.modifiedAtOf(value) });
  });
}

function remove(type, param) {
  return asyncHandler(async (req, res) => {
    await catalogService.deleteResource(type, req.params[param], current => assertIfMatch(req, current));
    return res.status(204).end();
  });
}

function unsupportedMethod(allow) {
  return function rejectMethod(req, res, next) {
    res.set('Allow', allow);
    next(new AppError(405, 'METHOD_NOT_ALLOWED', `Allowed methods for this resource: ${allow}.`));
  };
}

module.exports = { listProvinces, listChildren, getOne, create, replace, patch, remove, unsupportedMethod };
