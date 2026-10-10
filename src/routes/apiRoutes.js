const express = require('express');
const validate = require('../middleware/validate');
const { authenticateJWT, requireScope, requireClientType } = require('../middleware/authentication');
const { schemas } = require('../validators/schemas');
const catalog = require('../controllers/catalogController');
const readings = require('../controllers/readingController');

const router = express.Router();
const auth = authenticateJWT;
const analyst = [auth, requireScope('analyst-read')];
const manager = [auth, requireScope('resource:manage')];

router.get('/provinces', ...analyst, validate(schemas.collectionQuery, 'query'), catalog.listProvinces());
router.post('/provinces', ...manager, validate(schemas.province), catalog.create('province'));
router.all('/provinces', catalog.unsupportedMethod('GET, POST'));

router.get('/provinces/:provinceId', ...analyst, validate(schemas.paramsProvince, 'params'), catalog.getOne('province', 'provinceId'));
router.put('/provinces/:provinceId', ...manager, validate(schemas.paramsProvince, 'params'), validate(schemas.province), catalog.replace('province', 'provinceId'));
router.patch('/provinces/:provinceId', ...manager, validate(schemas.paramsProvince, 'params'), validate(schemas.provincePatch), catalog.patch('province', 'provinceId'));
router.delete('/provinces/:provinceId', ...manager, validate(schemas.paramsProvince, 'params'), catalog.remove('province', 'provinceId'));
router.all('/provinces/:provinceId', catalog.unsupportedMethod('GET, PUT, PATCH, DELETE'));

router.get('/provinces/:provinceId/districts', ...analyst, validate(schemas.paramsProvince, 'params'), validate(schemas.collectionQuery, 'query'), catalog.listChildren('district'));
router.post('/provinces/:provinceId/districts', ...manager, validate(schemas.paramsProvince, 'params'), validate(schemas.districtCreate), catalog.create('district', 'provinceId'));
router.all('/provinces/:provinceId/districts', catalog.unsupportedMethod('GET, POST'));

router.get('/districts/:districtId', ...analyst, validate(schemas.paramsDistrict, 'params'), catalog.getOne('district', 'districtId'));
router.put('/districts/:districtId', ...manager, validate(schemas.paramsDistrict, 'params'), validate(schemas.district), catalog.replace('district', 'districtId'));
router.patch('/districts/:districtId', ...manager, validate(schemas.paramsDistrict, 'params'), validate(schemas.districtPatch), catalog.patch('district', 'districtId'));
router.delete('/districts/:districtId', ...manager, validate(schemas.paramsDistrict, 'params'), catalog.remove('district', 'districtId'));
router.all('/districts/:districtId', catalog.unsupportedMethod('GET, PUT, PATCH, DELETE'));

router.get('/districts/:districtId/grid-substations', ...analyst, validate(schemas.paramsDistrict, 'params'), validate(schemas.collectionQuery, 'query'), catalog.listChildren('substation'));
router.post('/districts/:districtId/grid-substations', ...manager, validate(schemas.paramsDistrict, 'params'), validate(schemas.substationCreate), catalog.create('substation', 'districtId'));
router.all('/districts/:districtId/grid-substations', catalog.unsupportedMethod('GET, POST'));

router.get('/grid-substations/:substationId', ...analyst, validate(schemas.paramsSubstation, 'params'), catalog.getOne('substation', 'substationId'));
router.put('/grid-substations/:substationId', ...manager, validate(schemas.paramsSubstation, 'params'), validate(schemas.substation), catalog.replace('substation', 'substationId'));
router.patch('/grid-substations/:substationId', ...manager, validate(schemas.paramsSubstation, 'params'), validate(schemas.substationPatch), catalog.patch('substation', 'substationId'));
router.delete('/grid-substations/:substationId', ...manager, validate(schemas.paramsSubstation, 'params'), catalog.remove('substation', 'substationId'));
router.all('/grid-substations/:substationId', catalog.unsupportedMethod('GET, PUT, PATCH, DELETE'));

router.get('/grid-substations/:substationId/installations', ...analyst, validate(schemas.paramsSubstation, 'params'), validate(schemas.collectionQuery, 'query'), catalog.listChildren('installation'));
router.post('/grid-substations/:substationId/installations', ...manager, validate(schemas.paramsSubstation, 'params'), validate(schemas.installationCreate), catalog.create('installation', 'substationId'));
router.all('/grid-substations/:substationId/installations', catalog.unsupportedMethod('GET, POST'));

router.get('/installations/:installationId', ...analyst, validate(schemas.paramsInstallation, 'params'), catalog.getOne('installation', 'installationId'));
router.put('/installations/:installationId', ...manager, validate(schemas.paramsInstallation, 'params'), validate(schemas.installation), catalog.replace('installation', 'installationId'));
router.patch('/installations/:installationId', ...manager, validate(schemas.paramsInstallation, 'params'), validate(schemas.installationPatch), catalog.patch('installation', 'installationId'));
router.delete('/installations/:installationId', ...manager, validate(schemas.paramsInstallation, 'params'), catalog.remove('installation', 'installationId'));
router.all('/installations/:installationId', catalog.unsupportedMethod('GET, PUT, PATCH, DELETE'));

router.get('/installations/:installationId/overview', ...analyst, validate(schemas.paramsInstallation, 'params'), readings.overview);
router.get('/installations/:installationId/last-known-reading', ...analyst, validate(schemas.paramsInstallation, 'params'), readings.lastKnown);

router.get('/installations/:installationId/readings', ...analyst, validate(schemas.paramsInstallation, 'params'), validate(schemas.readingQuery, 'query'), readings.installationHistory);
router.post('/installations/:installationId/readings', auth, requireScope('installation-write'), requireClientType('installation'), validate(schemas.paramsInstallation, 'params'), validate(schemas.reading), readings.ingest);
router.all('/installations/:installationId/readings', readings.unsupportedMethod('GET, POST'));

router.get('/installations/:installationId/readings/:readingId', ...analyst, validate(schemas.paramsReading, 'params'), readings.readingItem);
router.all('/installations/:installationId/readings/:readingId', readings.unsupportedMethod('GET'));

router.get('/readings', ...analyst, validate(schemas.globalReadingQuery, 'query'), readings.globalHistory);
router.all('/readings', readings.unsupportedMethod('GET'));

router.get('/districts/:districtId/generation-summary', ...analyst, validate(schemas.paramsDistrict, 'params'), readings.districtSummary);

module.exports = router;
