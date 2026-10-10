const base = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function expectStatus(url, expected, options) {
  const response = await fetch(url, options);
  if (response.status !== expected) throw new Error(`${url} returned ${response.status}, expected ${expected}`);
  return response;
}

async function main() {
  const health = await expectStatus(`${base}/health`, 200, { headers: { Accept: 'application/json' } });
  const healthBody = await health.json();
  if (healthBody.database !== 'connected') throw new Error('Health check did not confirm database connectivity.');
  const specResponse = await expectStatus(`${base}/openapi.json`, 200, { headers: { Accept: 'application/json' } });
  const spec = await specResponse.json();
  if (!String(spec.openapi).startsWith('3.')) throw new Error('OpenAPI document version is missing.');
  await expectStatus(`${base}/api-docs/`, 200, { headers: { Accept: 'text/html' } });
  console.log('PASS health: service and database connected');
  console.log('PASS OpenAPI: document is reachable');
  console.log('PASS Swagger UI: page is reachable');

  if (!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD) {
    console.log('SKIP authenticated checks: set SMOKE_EMAIL and SMOKE_PASSWORD to enable them.');
    return;
  }
  const login = await expectStatus(`${base}/api/v1/auth/tokens`, 200, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ clientType: 'user', email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD })
  });
  const token = (await login.json()).accessToken;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const provincesResponse = await expectStatus(`${base}/api/v1/provinces?limit=100`, 200, { headers });
  const provinces = await provincesResponse.json();
  const province = provinces.data[0];
  if (!province) throw new Error('No seed provinces were returned.');
  const districtsResponse = await expectStatus(`${base}/api/v1/provinces/${province._id}/districts?limit=100`, 200, { headers });
  const districts = await districtsResponse.json();
  const district = districts.data[0];
  if (!district) throw new Error('No seed districts were returned.');
  const substationsResponse = await expectStatus(`${base}/api/v1/districts/${district._id}/grid-substations?limit=100`, 200, { headers });
  const substations = await substationsResponse.json();
  const substation = substations.data[0];
  if (!substation) throw new Error('No seed substations were returned.');
  const installationsResponse = await expectStatus(`${base}/api/v1/grid-substations/${substation._id}/installations?limit=100`, 200, { headers });
  const installations = await installationsResponse.json();
  const installation = installations.data[0];
  if (!installation) throw new Error('No seed installations were returned.');
  await expectStatus(`${base}/api/v1/installations/${installation._id}/overview`, 200, { headers });
  await expectStatus(`${base}/api/v1/installations/${installation._id}/last-known-reading`, 200, { headers });
  const historyUrl = `${base}/api/v1/installations/${installation._id}/readings?limit=5&sort=-timestamp`;
  const history = await expectStatus(historyUrl, 200, { headers });
  const page = await history.json();
  if (page.pagination.totalCount < 672 || page.data.length !== 5) throw new Error('Seed history/pagination did not meet the expected scale.');
  const conditional = await expectStatus(historyUrl, 304, { headers: { ...headers, 'If-None-Match': history.headers.get('etag') } });
  if ((await conditional.text()) !== '') throw new Error('304 response unexpectedly contained a body.');
  await expectStatus(`${base}/api/v1/districts/${district._id}/generation-summary`, 200, { headers });
  console.log('PASS JWT, hierarchy, seed data, overview, latest reading, pagination, ETag/304, and district summary');
}

main().catch(error => {
  console.error(`FAIL local verification: ${error.message}`);
  process.exitCode = 1;
});
