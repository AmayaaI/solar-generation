const crypto = require('node:crypto');
const AppError = require('./appError');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (value && value._bsontype === 'ObjectId') return value.toString();
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key]);
    return result;
  }
  return value;
}

function etagFor(value) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('base64url');
  return `"${digest}"`;
}

function weakTag(value) {
  return value.trim().replace(/^W\//i, '');
}

function notModified(req, etag, modifiedAt) {
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch !== undefined) {
    return ifNoneMatch.split(',').some(tag => tag.trim() === '*' || weakTag(tag) === etag);
  }
  const ifModifiedSince = req.get('If-Modified-Since');
  if (!ifModifiedSince || !modifiedAt) return false;
  const since = Date.parse(ifModifiedSince);
  return Number.isFinite(since) && Math.floor(modifiedAt.getTime() / 1000) <= Math.floor(since / 1000);
}

function sendRepresentation(req, res, value, options = {}) {
  const { status = 200, modifiedAt = new Date(0) } = options;
  const normalizedModifiedAt = modifiedAt instanceof Date ? modifiedAt : new Date(modifiedAt);
  const etag = etagFor(value);
  res.set('ETag', etag);
  if (Number.isFinite(normalizedModifiedAt.getTime())) {
    res.set('Last-Modified', normalizedModifiedAt.toUTCString());
  }
  res.set('Cache-Control', 'private, no-cache');
  if ((req.method === 'GET' || req.method === 'HEAD') && notModified(req, etag, normalizedModifiedAt)) return res.status(304).end();
  return res.status(status).json(value);
}

function assertIfMatch(req, currentRepresentation) {
  const header = req.get('If-Match');
  if (header === undefined) return;
  const current = etagFor(currentRepresentation);
  const matches = header.split(',').some(tag => tag.trim() === '*' || tag.trim() === current);
  if (!matches) throw new AppError(412, 'PRECONDITION_FAILED', 'The resource has changed since the supplied ETag was issued.');
}

module.exports = { etagFor, sendRepresentation, assertIfMatch };
