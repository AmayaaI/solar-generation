const bcrypt = require('bcryptjs');
const Province = require('../models/province');
const District = require('../models/district');
const GridSubstation = require('../models/gridSubstation');
const SolarInstallation = require('../models/solarInstallation');
const GenerationReading = require('../models/generationReading');
const AppError = require('../utils/appError');
const { authorizeResource } = require('./accessService');

const catalog = {
  province: { model: Province, parentType: null, parentField: null },
  district: { model: District, parentType: 'province', parentField: 'provinceId' },
  substation: { model: GridSubstation, parentType: 'district', parentField: 'districtId' },
  installation: { model: SolarInstallation, parentType: 'substation', parentField: 'substationId' }
};

function plain(resource) {
  if (!resource) return resource;
  const value = typeof resource.toObject === 'function' ? resource.toObject() : { ...resource };
  delete value.deviceSecretHash;
  delete value.__v;
  return value;
}

function modifiedAtOf(value) {
  return value && (value.updatedAt || value.createdAt) ? new Date(value.updatedAt || value.createdAt) : new Date(0);
}

async function get(type, id, auth, { managerCanRead = true } = {}) {
  const spec = catalog[type];
  const item = await spec.model.findById(id).lean();
  if (!item) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${type} was not found.`);
  if (!(managerCanRead && auth.scopes.includes('resource:manage'))) await authorizeResource(type, item, auth);
  return plain(item);
}

async function getChildren(type, parentId, auth, filterExtra = {}) {
  const spec = catalog[type];
  const parent = await catalog[spec.parentType].model.findById(parentId).lean();
  if (!parent) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${spec.parentType} was not found.`);
  if (!auth.scopes.includes('resource:manage')) await authorizeResource(spec.parentType, parent, auth);
  const query = { [spec.parentField]: parentId, ...filterExtra };
  const values = await spec.model.find(query).sort({ name: 1, _id: 1 }).lean();
  if (!auth.scopes.includes('resource:manage')) {
    const authorized = [];
    for (const value of values) {
      try { await authorizeResource(type, value, auth); authorized.push(plain(value)); }
      catch (error) { if (error.status !== 403) throw error; }
    }
    return authorized;
  }
  return values.map(plain);
}

async function listProvinces(auth) {
  const query = {};
  if (!auth.scopes.includes('resource:manage')) {
    if (auth.role === 'province') query._id = auth.provinceId;
    if (auth.role === 'district') {
      const district = await District.findById(auth.districtId).select('provinceId').lean();
      if (!district) throw new AppError(403, 'JURISDICTION_FORBIDDEN', 'The district identity is no longer valid.');
      query._id = district.provinceId;
    }
  }
  return (await Province.find(query).sort({ name: 1 }).lean()).map(plain);
}

async function ensureParent(type, parentId) {
  const parentSpec = catalog[type];
  const parent = await parentSpec.model.findById(parentId).lean();
  if (!parent) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${type} was not found.`);
  return parent;
}

async function create(type, body, parentId) {
  const spec = catalog[type];
  const values = { ...body };
  if (spec.parentField) {
    await ensureParent(spec.parentType, parentId);
    values[spec.parentField] = parentId;
  }
  if (type === 'installation') {
    values.deviceSecretHash = await bcrypt.hash(values.deviceSecret, 12);
    delete values.deviceSecret;
  }
  const created = await spec.model.create(values);
  return plain(created);
}

async function replace(type, id, body, ifMatchCheck) {
  const spec = catalog[type];
  const current = await spec.model.findById(id);
  if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${type} was not found.`);
  const currentPlain = plain(current);
  if (ifMatchCheck) ifMatchCheck(currentPlain);
  const values = { ...body };
  if (spec.parentField) {
    if (String(values[spec.parentField]) !== String(current[spec.parentField])) {
      throw new AppError(409, 'PARENT_REFERENCE_IMMUTABLE', 'A resource parent cannot be changed after creation.');
    }
  }
  Object.assign(current, values);
  current.version = (current.version || 0) + 1;
  await current.save();
  return plain(current);
}

async function patch(type, id, body, ifMatchCheck) {
  const spec = catalog[type];
  const current = await spec.model.findById(id);
  if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${type} was not found.`);
  if (ifMatchCheck) ifMatchCheck(plain(current));
  if (spec.parentField && body[spec.parentField] !== undefined && String(body[spec.parentField]) !== String(current[spec.parentField])) {
    throw new AppError(409, 'PARENT_REFERENCE_IMMUTABLE', 'A resource parent cannot be changed after creation.');
  }
  Object.assign(current, body);
  current.version = (current.version || 0) + 1;
  await current.save();
  return plain(current);
}

async function deleteResource(type, id, ifMatchCheck) {
  const spec = catalog[type];
  const current = await spec.model.findById(id);
  if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${type} was not found.`);
  if (ifMatchCheck) ifMatchCheck(plain(current));
  const dependencies = {
    province: [District, 'provinceId'],
    district: [GridSubstation, 'districtId'],
    substation: [SolarInstallation, 'substationId'],
    installation: [GenerationReading, 'installationId']
  };
  const [childModel, foreignKey] = dependencies[type];
  if (await childModel.exists({ [foreignKey]: current._id })) {
    throw new AppError(409, 'RESOURCE_HAS_DEPENDENTS', `The ${type} cannot be deleted while dependent records exist.`);
  }
  await current.deleteOne();
}

module.exports = { catalog, plain, modifiedAtOf, get, getChildren, listProvinces, create, replace, patch, deleteResource };
