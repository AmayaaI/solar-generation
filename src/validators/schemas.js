const Joi = require('joi');

const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i);
const isoTimestamp = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/i)
  .custom((value, helpers) => Number.isNaN(Date.parse(value)) ? helpers.error('date.format') : value)
  .messages({ 'date.format': 'must be a valid ISO 8601 timestamp with a timezone' });
const bcryptInput = (min = 1) => Joi.string().min(min).max(72).custom((value, helpers) =>
  Buffer.byteLength(value, 'utf8') > 72 ? helpers.error('string.max') : value
).messages({ 'string.max': 'must not exceed bcrypt’s 72-byte input limit' });

const schemas = {
  paramsId: Joi.object({ id: objectId.required() }).required(),
  paramsInstallation: Joi.object({ installationId: objectId.required() }).required(),
  paramsReading: Joi.object({ installationId: objectId.required(), readingId: objectId.required() }).required(),
  paramsProvince: Joi.object({ provinceId: objectId.required() }).required(),
  paramsDistrict: Joi.object({ districtId: objectId.required() }).required(),
  paramsSubstation: Joi.object({ substationId: objectId.required() }).required(),
  auth: Joi.alternatives().try(
    Joi.object({ clientType: Joi.string().valid('user').required(), email: Joi.string().email().max(254).required(), password: bcryptInput().required() }).required(),
    Joi.object({ clientType: Joi.string().valid('installation').required(), meterId: Joi.string().trim().max(64).required(), secret: bcryptInput(16).required() }).required()
  ),
  province: Joi.object({ name: Joi.string().trim().min(2).max(100).required(), code: Joi.string().trim().uppercase().min(2).max(12).required() }).required(),
  provincePatch: Joi.object({ name: Joi.string().trim().min(2).max(100), code: Joi.string().trim().uppercase().min(2).max(12) }).min(1).required(),
  districtCreate: Joi.object({ name: Joi.string().trim().min(2).max(100).required(), code: Joi.string().trim().uppercase().min(2).max(12).required() }).required(),
  district: Joi.object({ name: Joi.string().trim().min(2).max(100).required(), code: Joi.string().trim().uppercase().min(2).max(12).required(), provinceId: objectId.required() }).required(),
  districtPatch: Joi.object({ name: Joi.string().trim().min(2).max(100), code: Joi.string().trim().uppercase().min(2).max(12), provinceId: objectId }).min(1).required(),
  substationCreate: Joi.object({ name: Joi.string().trim().min(2).max(120).required(), code: Joi.string().trim().uppercase().min(2).max(20).required() }).required(),
  substation: Joi.object({ name: Joi.string().trim().min(2).max(120).required(), code: Joi.string().trim().uppercase().min(2).max(20).required(), districtId: objectId.required() }).required(),
  substationPatch: Joi.object({ name: Joi.string().trim().min(2).max(120), code: Joi.string().trim().uppercase().min(2).max(20), districtId: objectId }).min(1).required(),
  installationCreate: Joi.object({ meterId: Joi.string().trim().uppercase().min(2).max(64).required(), capacityKw: Joi.number().positive().max(100000).required(), deviceSecret: bcryptInput(16).required() }).required(),
  installation: Joi.object({ meterId: Joi.string().trim().uppercase().min(2).max(64).required(), capacityKw: Joi.number().positive().max(100000).required(), substationId: objectId.required() }).required(),
  installationPatch: Joi.object({ meterId: Joi.string().trim().uppercase().min(2).max(64), capacityKw: Joi.number().positive().max(100000), substationId: objectId }).min(1).required(),
  reading: Joi.object({
    timestamp: isoTimestamp.required(),
    instantaneousPowerKw: Joi.number().min(0).required(),
    cumulativeEnergyKwh: Joi.number().min(0).required(),
    voltage: Joi.number().min(180).max(260).required()
  }).required(),
  readingQuery: Joi.object({ from: isoTimestamp, to: isoTimestamp, page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(50), sort: Joi.string().valid('timestamp', '-timestamp').default('-timestamp') }).required(),
  collectionQuery: Joi.object({ page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(50) }).required(),
  globalReadingQuery: Joi.object({
    'province-id': objectId,
    'district-id': objectId,
    'substation-id': objectId,
    'installation-id': objectId,
    from: isoTimestamp,
    to: isoTimestamp,
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    sort: Joi.string().valid('timestamp', '-timestamp').default('-timestamp')
  }).required()
};

module.exports = { schemas };
