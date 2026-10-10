process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-long';
process.env.JWT_TTL = '15m';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const Province = require('../src/models/province');
const District = require('../src/models/district');
const GridSubstation = require('../src/models/gridSubstation');
const SolarInstallation = require('../src/models/solarInstallation');
const GenerationReading = require('../src/models/generationReading');
const User = require('../src/models/user');

let mongo;
let ids = {};
let tokens = {};

async function issueUserToken(email, password) {
  const response = await request(app).post('/api/v1/auth/tokens').send({ clientType: 'user', email, password });
  if (response.status !== 200) throw new Error(`User token issuance failed: ${JSON.stringify(response.body)}`);
  return response.body.accessToken;
}

async function issueDeviceToken(meterId, secret) {
  const response = await request(app).post('/api/v1/auth/tokens').send({ clientType: 'installation', meterId, secret });
  if (response.status !== 200) throw new Error(`Device token issuance failed: ${JSON.stringify(response.body)}`);
  return response.body.accessToken;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  for (const model of [Province, District, GridSubstation, SolarInstallation, GenerationReading, User]) await model.createIndexes();

  const province = await Province.create({ name: 'Western', code: 'WST' });
  const otherProvince = await Province.create({ name: 'Central', code: 'CTR' });
  const districtA = await District.create({ name: 'Colombo', code: 'COL', provinceId: province._id });
  const districtB = await District.create({ name: 'Gampaha', code: 'GAM', provinceId: province._id });
  const districtC = await District.create({ name: 'Kandy', code: 'KAN', provinceId: otherProvince._id });
  const substationA = await GridSubstation.create({ name: 'Colombo Central', code: 'COL-01', districtId: districtA._id });
  const substationB = await GridSubstation.create({ name: 'Gampaha Central', code: 'GAM-01', districtId: districtB._id });
  const substationC = await GridSubstation.create({ name: 'Kandy Central', code: 'KAN-01', districtId: districtC._id });
  const [deviceHashA, deviceHashB, deviceHashC, deviceHashEmpty] = await Promise.all([
    bcrypt.hash('device-secret-A-123456', 4), bcrypt.hash('device-secret-B-123456', 4),
    bcrypt.hash('device-secret-C-123456', 4), bcrypt.hash('device-secret-empty-123456', 4)
  ]);
  const installationA = await SolarInstallation.create({ meterId: 'METER-A', substationId: substationA._id, capacityKw: 10, deviceSecretHash: deviceHashA });
  const installationB = await SolarInstallation.create({ meterId: 'METER-B', substationId: substationB._id, capacityKw: 8, deviceSecretHash: deviceHashB });
  const installationC = await SolarInstallation.create({ meterId: 'METER-C', substationId: substationC._id, capacityKw: 6, deviceSecretHash: deviceHashC });
  const noReadInstallation = await SolarInstallation.create({ meterId: 'METER-EMPTY', substationId: substationA._id, capacityKw: 4, deviceSecretHash: deviceHashEmpty });
  const passwordHash = await bcrypt.hash('analyst-password', 4);
  await User.create([
    { email: 'national@example.com', passwordHash, role: 'national' },
    { email: 'province@example.com', passwordHash, role: 'province', provinceId: province._id },
    { email: 'district-a@example.com', passwordHash, role: 'district', districtId: districtA._id },
    { email: 'district-b@example.com', passwordHash, role: 'district', districtId: districtB._id },
    { email: 'admin@example.com', passwordHash, role: 'national', managementEnabled: true }
  ]);

  const now = new Date();
  const readings = [];
  let energy = 1000;
  for (let i = 0; i < 55; i += 1) {
    const timestamp = new Date(now.getTime() - (54 - i) * 15 * 60 * 1000);
    energy += 0.3;
    readings.push({ installationId: installationA._id, timestamp, instantaneousPowerKw: 1.2, cumulativeEnergyKwh: energy, voltage: 230 });
  }
  for (let i = 0; i < 4; i += 1) {
    readings.push({ installationId: installationB._id, timestamp: new Date(now.getTime() - (3 - i) * 15 * 60 * 1000), instantaneousPowerKw: 0.8, cumulativeEnergyKwh: 50 + i, voltage: 229 });
  }
  readings.push({ installationId: installationC._id, timestamp: now, instantaneousPowerKw: 0.5, cumulativeEnergyKwh: 10, voltage: 231 });
  await GenerationReading.insertMany(readings);

  ids = {
    province: String(province._id), otherProvince: String(otherProvince._id),
    districtA: String(districtA._id), districtB: String(districtB._id), districtC: String(districtC._id),
    substationA: String(substationA._id),
    installationA: String(installationA._id), installationB: String(installationB._id), installationC: String(installationC._id),
    noReadInstallation: String(noReadInstallation._id)
  };
  tokens = {
    national: await issueUserToken('national@example.com', 'analyst-password'),
    province: await issueUserToken('province@example.com', 'analyst-password'),
    districtA: await issueUserToken('district-a@example.com', 'analyst-password'),
    districtB: await issueUserToken('district-b@example.com', 'analyst-password'),
    admin: await issueUserToken('admin@example.com', 'analyst-password'),
    deviceA: await issueDeviceToken('METER-A', 'device-secret-A-123456')
  };
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const bearer = token => ({ Authorization: `Bearer ${token}` });

describe('API operational and analytical resources', () => {
  test('health, OpenAPI, and hierarchy resources respond', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    const docs = await request(app).get('/openapi.json');
    expect(docs.status).toBe(200);
    expect(docs.body.openapi).toBe('3.1.0');
    const province = await request(app).get(`/api/v1/provinces/${ids.province}`).set(bearer(tokens.national));
    expect(province.status).toBe(200);
    expect(province.headers.etag).toBeTruthy();
    expect(province.headers['last-modified']).toBeTruthy();
    const collection = await request(app).get('/api/v1/provinces').set(bearer(tokens.national));
    expect(collection.status).toBe(200);
    expect(collection.body.data).toHaveLength(2);
    const nested = await request(app).get(`/api/v1/provinces/${ids.province}/districts`).set(bearer(tokens.province));
    expect(nested.status).toBe(200);
    expect(nested.body.data).toHaveLength(2);
    const invalid = await request(app).get('/api/v1/provinces/not-an-id').set(bearer(tokens.national));
    expect(invalid.status).toBe(400);
    const absent = await request(app).get(`/api/v1/districts/${new mongoose.Types.ObjectId()}`).set(bearer(tokens.national));
    expect(absent.status).toBe(404);
  });

  test('district and installation jurisdiction is enforced', async () => {
    expect((await request(app).get(`/api/v1/districts/${ids.districtA}`).set(bearer(tokens.districtA))).status).toBe(200);
    expect((await request(app).get(`/api/v1/districts/${ids.districtB}`).set(bearer(tokens.districtA))).status).toBe(403);
    expect((await request(app).get(`/api/v1/installations/${ids.installationC}`).set(bearer(tokens.province))).status).toBe(403);
    expect((await request(app).get(`/api/v1/districts/${ids.districtC}`).set(bearer(tokens.province))).status).toBe(403);
  });

  test('history is filtered, sorted, and genuinely paginated', async () => {
    const url = `/api/v1/installations/${ids.installationA}/readings`;
    const first = await request(app).get(url).query({ page: 1, limit: 20 }).set(bearer(tokens.districtA));
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(20);
    expect(first.body.pagination).toMatchObject({ page: 1, limit: 20, totalCount: 55, totalPages: 3 });
    expect(first.body.links.next).toContain('page=2');
    const last = await request(app).get(url).query({ page: 3, limit: 20 }).set(bearer(tokens.districtA));
    expect(last.body.data).toHaveLength(15);
    expect(last.body.links.next).toBeNull();
    const middle = await request(app).get(url).query({ page: 2, limit: 20 }).set(bearer(tokens.districtA));
    expect(middle.body.data).toHaveLength(20);
    expect(middle.body.links.previous).toContain('page=1');
    const beyond = await request(app).get(url).query({ page: 20, limit: 20 }).set(bearer(tokens.districtA));
    expect(beyond.body.data).toHaveLength(0);
    expect(beyond.body.links.previous).toContain('page=3');
    const ascending = await request(app).get(url).query({ sort: 'timestamp', limit: 5 }).set(bearer(tokens.districtA));
    expect(new Date(ascending.body.data[0].timestamp).getTime()).toBeLessThan(new Date(ascending.body.data[4].timestamp).getTime());
    const descending = await request(app).get(url).query({ sort: '-timestamp', limit: 5 }).set(bearer(tokens.districtA));
    expect(new Date(descending.body.data[0].timestamp).getTime()).toBeGreaterThan(new Date(descending.body.data[4].timestamp).getTime());
    const empty = await request(app).get(url).query({ from: '2030-01-01T00:00:00Z', limit: 10 }).set(bearer(tokens.districtA));
    expect(empty.body.pagination.totalCount).toBe(0);
    expect(empty.body.links.next).toBeNull();
    const validWindow = await request(app).get(url).query({ from: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(), to: new Date(Date.now() + 60 * 1000).toISOString(), limit: 100 }).set(bearer(tokens.districtA));
    expect(validWindow.body.pagination.totalCount).toBe(55);
    const invalidRange = await request(app).get(url).query({ from: '2026-10-05T12:00:00Z', to: '2026-10-04T12:00:00Z' }).set(bearer(tokens.districtA));
    expect(invalidRange.status).toBe(400);
    expect((await request(app).get(url).query({ sort: 'power' }).set(bearer(tokens.districtA))).status).toBe(400);
  });

  test('global region filter is constrained by the JWT jurisdiction', async () => {
    const own = await request(app).get('/api/v1/readings').query({ 'district-id': ids.districtA, limit: 100 }).set(bearer(tokens.districtA));
    expect(own.status).toBe(200);
    expect(own.body.pagination.totalCount).toBe(55);
    const other = await request(app).get('/api/v1/readings').query({ 'district-id': ids.districtB }).set(bearer(tokens.districtA));
    expect(other.status).toBe(403);
    const mismatchedFilter = await request(app).get('/api/v1/readings').query({ 'province-id': ids.province, 'district-id': ids.districtC }).set(bearer(tokens.national));
    expect(mismatchedFilter.status).toBe(200);
    expect(mismatchedFilter.body.pagination.totalCount).toBe(0);
    const provinceResults = await request(app).get('/api/v1/readings').query({ 'province-id': ids.province, limit: 100 }).set(bearer(tokens.national));
    expect(provinceResults.body.pagination.totalCount).toBe(59);
    const substationResults = await request(app).get('/api/v1/readings').query({ 'substation-id': ids.substationA, limit: 100 }).set(bearer(tokens.national));
    expect(substationResults.body.pagination.totalCount).toBe(55);
    const ownProvinceFilter = await request(app).get('/api/v1/readings').query({ 'province-id': ids.province, limit: 100 }).set(bearer(tokens.districtA));
    expect(ownProvinceFilter.body.pagination.totalCount).toBe(55);
    const unknownFilter = await request(app).get('/api/v1/readings').query({ 'district-id': 'bad-id' }).set(bearer(tokens.national));
    expect(unknownFilter.status).toBe(400);
  });

  test('overview and last-known reading are derived from stored readings', async () => {
    const overview = await request(app).get(`/api/v1/installations/${ids.installationA}/overview`).set(bearer(tokens.districtA));
    expect(overview.status).toBe(200);
    expect(overview.body.installation.meterId).toBe('METER-A');
    expect(overview.body.district.name).toBe('Colombo');
    expect(overview.body.lastKnownReading.instantaneousPowerKw).toBe(1.2);
    const last = await request(app).get(`/api/v1/installations/${ids.installationA}/last-known-reading`).set(bearer(tokens.districtA));
    expect(last.status).toBe(200);
    expect(last.body._id).toBe(overview.body.lastKnownReading._id);
    const emptyLast = await request(app).get(`/api/v1/installations/${ids.noReadInstallation}/last-known-reading`).set(bearer(tokens.districtA));
    expect(emptyLast.status).toBe(404);
    const emptyHistory = await request(app).get(`/api/v1/installations/${ids.noReadInstallation}/readings`).set(bearer(tokens.districtA));
    expect(emptyHistory.body.pagination.totalCount).toBe(0);
  });

  test('conditional GET returns bodyless 304 and honors If-Modified-Since', async () => {
    const url = `/api/v1/districts/${ids.districtA}`;
    const initial = await request(app).get(url).set(bearer(tokens.districtA));
    const byEtag = await request(app).get(url).set(bearer(tokens.districtA)).set('If-None-Match', initial.headers.etag);
    expect(byEtag.status).toBe(304);
    expect(byEtag.text || '').toBe('');
    const byDate = await request(app).get(url).set(bearer(tokens.districtA)).set('If-Modified-Since', initial.headers['last-modified']);
    expect(byDate.status).toBe(304);
    expect(byDate.text || '').toBe('');
    const changedSince = await request(app).get(url).set(bearer(tokens.districtA)).set('If-Modified-Since', 'Thu, 01 Jan 1970 00:00:00 GMT');
    expect(changedSince.status).toBe(200);
  });

  test('device may append only to itself and creation returns Location', async () => {
    const timestamp = new Date(Date.now() + 60 * 1000).toISOString();
    const body = { timestamp, instantaneousPowerKw: 2, cumulativeEnergyKwh: 1017, voltage: 230 };
    const created = await request(app).post(`/api/v1/installations/${ids.installationA}/readings`).set(bearer(tokens.deviceA)).send(body);
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`/api/v1/installations/${ids.installationA}/readings/${created.body._id}`);
    const item = await request(app).get(created.headers.location).set(bearer(tokens.districtA));
    expect(item.status).toBe(200);
    const anotherInstallation = await request(app).post(`/api/v1/installations/${ids.installationB}/readings`).set(bearer(tokens.deviceA)).send({ ...body, timestamp: new Date(Date.now() + 2 * 60 * 1000).toISOString() });
    expect(anotherInstallation.status).toBe(403);
    const missingAuth = await request(app).post(`/api/v1/installations/${ids.installationA}/readings`).send(body);
    expect(missingAuth.status).toBe(401);
    const credentialReuse = await request(app).post('/api/v1/auth/tokens').send({ clientType: 'installation', meterId: 'METER-B', secret: 'device-secret-A-123456' });
    expect(credentialReuse.status).toBe(401);
    const overCapacity = await request(app).post(`/api/v1/installations/${ids.installationA}/readings`).set(bearer(tokens.deviceA)).send({ ...body, timestamp: new Date(Date.now() + 3 * 60 * 1000).toISOString(), instantaneousPowerKw: 11 });
    expect(overCapacity.status).toBe(400);
    const nonMonotonic = await request(app).post(`/api/v1/installations/${ids.installationA}/readings`).set(bearer(tokens.deviceA)).send({ ...body, timestamp: new Date(Date.now() - 60 * 1000).toISOString() });
    expect(nonMonotonic.status).toBe(409);
    const noReadScope = await request(app).get(`/api/v1/installations/${ids.installationA}/readings`).set(bearer(tokens.deviceA));
    expect(noReadScope.status).toBe(403);
    const badReading = await request(app).post(`/api/v1/installations/${ids.installationA}/readings`).set(bearer(tokens.deviceA)).send({ ...body, timestamp: 'tomorrow' });
    expect(badReading.status).toBe(400);
  });

  test('generation summary is aggregated and readings are append-only', async () => {
    const summary = await request(app).get(`/api/v1/districts/${ids.districtA}/generation-summary`).set(bearer(tokens.districtA));
    expect(summary.status).toBe(200);
    expect(summary.body.installationCount).toBe(2);
    expect(summary.body.currentTotalPowerKw).toBeGreaterThan(0);
    expect(new Date(summary.body.timestamp).getTime()).toBeLessThanOrEqual(Date.now());

    await GenerationReading.create({
      installationId: ids.noReadInstallation,
      timestamp: new Date(Date.now() + 60 * 60 * 1000),
      instantaneousPowerKw: 4,
      cumulativeEnergyKwh: 10,
      voltage: 230
    });
    const afterFutureReading = await request(app).get(`/api/v1/districts/${ids.districtA}/generation-summary`).set(bearer(tokens.districtA));
    expect(afterFutureReading.body.timestamp).toBe(summary.body.timestamp);
    expect(afterFutureReading.body.reportingInstallationCount).toBe(summary.body.reportingInstallationCount);
    expect(afterFutureReading.body.currentTotalPowerKw).toBe(summary.body.currentTotalPowerKw);
    const unsupported = await request(app).delete(`/api/v1/installations/${ids.installationA}/readings/${new mongoose.Types.ObjectId()}`).set(bearer(tokens.national));
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.allow).toBe('GET');
  });

  test('metadata writes use If-Match and protect dependent hierarchy records', async () => {
    const url = `/api/v1/provinces/${ids.province}`;
    const first = await request(app).get(url).set(bearer(tokens.admin));
    const stale = await request(app).put(url).set(bearer(tokens.admin)).set('If-Match', '"stale"').send({ name: 'Western Province', code: 'WST' });
    expect(stale.status).toBe(412);
    const update = await request(app).put(url).set(bearer(tokens.admin)).set('If-Match', first.headers.etag).send({ name: 'Western Province', code: 'WST' });
    expect(update.status).toBe(200);
    const deleteParent = await request(app).delete(url).set(bearer(tokens.admin));
    expect(deleteParent.status).toBe(409);
    const analystWrite = await request(app).post('/api/v1/provinces').set(bearer(tokens.national)).send({ name: 'No Write', code: 'NW' });
    expect(analystWrite.status).toBe(403);
    const createdProvince = await request(app).post('/api/v1/provinces').set(bearer(tokens.admin)).send({ name: 'Test Province', code: 'TST' });
    expect(createdProvince.status).toBe(201);
    expect(createdProvince.headers.location).toBe(`/api/v1/provinces/${createdProvince.body._id}`);
    const createdDistrict = await request(app).post(`/api/v1/provinces/${createdProvince.body._id}/districts`).set(bearer(tokens.admin)).send({ name: 'Test District', code: 'TST-D' });
    expect(createdDistrict.status).toBe(201);
    expect(createdDistrict.headers.location).toBe(`/api/v1/districts/${createdDistrict.body._id}`);
    const deletedDistrict = await request(app).delete(`/api/v1/districts/${createdDistrict.body._id}`).set(bearer(tokens.admin));
    expect(deletedDistrict.status).toBe(204);
    expect(deletedDistrict.text || '').toBe('');
  });

  test('validation, unsupported media negotiation, and stable error shape', async () => {
    const malformed = await request(app).get('/api/v1/provinces/not-an-id').set(bearer(tokens.national));
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'VALIDATION_ERROR', details: expect.any(Array) });
    const unacceptable = await request(app).get('/api/v1/provinces').set(bearer(tokens.national)).set('Accept', 'text/html');
    expect(unacceptable.status).toBe(406);
    expect(unacceptable.body.code).toBe('NOT_ACCEPTABLE');
  });
});
