const Province = require('../models/province');
const District = require('../models/district');
const GridSubstation = require('../models/gridSubstation');
const SolarInstallation = require('../models/solarInstallation');
const GenerationReading = require('../models/generationReading');
const AppError = require('../utils/appError');

async function findOr404(model, id, label) {
  const value = await model.findById(id).lean();
  if (!value) throw new AppError(404, 'RESOURCE_NOT_FOUND', `${label} was not found.`);
  return value;
}

async function contextFor(type, value) {
  if (type === 'province') return { provinceId: String(value._id), districtId: null };
  if (type === 'district') return { provinceId: String(value.provinceId), districtId: String(value._id) };
  if (type === 'substation') {
    const district = await findOr404(District, value.districtId, 'District');
    return { provinceId: String(district.provinceId), districtId: String(district._id) };
  }
  if (type === 'installation') {
    const substation = await findOr404(GridSubstation, value.substationId, 'Grid substation');
    const district = await findOr404(District, substation.districtId, 'District');
    return { provinceId: String(district.provinceId), districtId: String(district._id) };
  }
  if (type === 'reading') {
    const installation = await findOr404(SolarInstallation, value.installationId, 'Solar installation');
    return contextFor('installation', installation);
  }
  throw new Error(`Unknown resource type: ${type}`);
}

function assertJurisdiction(auth, context) {
  if (auth.role === 'national') return;
  if (auth.role === 'province' && auth.provinceId === context.provinceId) return;
  if (auth.role === 'district' && auth.districtId === context.districtId) return;
  throw new AppError(403, 'JURISDICTION_FORBIDDEN', 'The requested resource is outside the authenticated jurisdiction.');
}

async function authorizeResource(type, value, auth) {
  const context = await contextFor(type, value);
  if (type === 'province' && auth.role === 'district') {
    const callerDistrict = await findOr404(District, auth.districtId, 'District');
    if (String(callerDistrict.provinceId) === context.provinceId) return context;
  }
  assertJurisdiction(auth, context);
  return context;
}

async function authorizeParentCollection(parentType, parentId, auth) {
  const models = { province: Province, district: District, substation: GridSubstation };
  const parent = await findOr404(models[parentType], parentId, parentType);
  await authorizeResource(parentType, parent, auth);
  return parent;
}

async function resolveInstallationIds(filters, auth) {
  let allowedDistrictIds = null;
  if (filters.provinceId) {
    const province = await findOr404(Province, filters.provinceId, 'Province');
    await authorizeResource('province', province, auth);
    if (auth.role === 'district') {
      allowedDistrictIds = [auth.districtId];
    } else {
      const districts = await District.find({ provinceId: province._id }).select('_id').lean();
      allowedDistrictIds = districts.map(item => item._id);
    }
  }
  if (filters.districtId) {
    const district = await findOr404(District, filters.districtId, 'District');
    await authorizeResource('district', district, auth);
    if (filters.provinceId && String(district.provinceId) !== String(filters.provinceId)) return [];
    allowedDistrictIds = [district._id];
  }

  if (!allowedDistrictIds && auth.role === 'province') {
    const districts = await District.find({ provinceId: auth.provinceId }).select('_id').lean();
    allowedDistrictIds = districts.map(item => item._id);
  } else if (!allowedDistrictIds && auth.role === 'district') {
    allowedDistrictIds = [auth.districtId];
  }

  let substationIds = null;
  if (allowedDistrictIds) {
    const substations = await GridSubstation.find({ districtId: { $in: allowedDistrictIds } }).select('_id').lean();
    substationIds = substations.map(item => item._id);
  }

  if (filters.substationId) {
    const substation = await findOr404(GridSubstation, filters.substationId, 'Grid substation');
    await authorizeResource('substation', substation, auth);
    if (substationIds && !substationIds.some(id => String(id) === String(substation._id))) return [];
    substationIds = [substation._id];
  }

  const installationQuery = {};
  if (substationIds) installationQuery.substationId = { $in: substationIds };
  if (filters.installationId) {
    const installation = await findOr404(SolarInstallation, filters.installationId, 'Solar installation');
    await authorizeResource('installation', installation, auth);
    if (substationIds && !substationIds.some(id => String(id) === String(installation.substationId))) return [];
    installationQuery._id = installation._id;
  }
  const installations = await SolarInstallation.find(installationQuery).select('_id').lean();
  return installations.map(item => item._id);
}

async function authorizeReading(reading, auth) {
  return authorizeResource('reading', reading, auth);
}

module.exports = {
  authorizeResource,
  authorizeParentCollection,
  resolveInstallationIds,
  authorizeReading
};
