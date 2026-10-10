const provinces = [
  { code: 'WST', name: 'Western', districts: ['Colombo', 'Gampaha', 'Kalutara'] },
  { code: 'CTR', name: 'Central', districts: ['Kandy', 'Matale', 'Nuwara Eliya'] },
  { code: 'STH', name: 'Southern', districts: ['Galle', 'Matara', 'Hambantota'] },
  { code: 'NTH', name: 'Northern', districts: ['Jaffna', 'Kilinochchi', 'Mannar', 'Mullaitivu', 'Vavuniya'] },
  { code: 'EST', name: 'Eastern', districts: ['Trincomalee', 'Batticaloa', 'Ampara'] },
  { code: 'NWF', name: 'North Western', districts: ['Kurunegala', 'Puttalam'] },
  { code: 'NCN', name: 'North Central', districts: ['Anuradhapura', 'Polonnaruwa'] },
  { code: 'UVA', name: 'Uva', districts: ['Badulla', 'Monaragala'] },
  { code: 'SAB', name: 'Sabaragamuwa', districts: ['Ratnapura', 'Kegalle'] }
];

function deriveDeviceSecret(masterSecret, meterId) {
  return require('node:crypto').createHmac('sha256', masterSecret).update(String(meterId).trim().toUpperCase()).digest('base64url');
}

function stableHex(key) {
  return require('node:crypto').createHash('md5').update(String(key)).digest('hex').slice(0, 24);
}

function objectIdFor(key) {
  const mongoose = require('mongoose');
  return new mongoose.Types.ObjectId(stableHex(key));
}

function generatedPower(capacityKw, localHour, installationIndex, intervalIndex) {
  if (localHour < 6 || localHour >= 18) return 0;
  const daylight = Math.sin(Math.PI * (localHour - 6) / 12);
  const cloud = 0.78 + 0.18 * Math.abs(Math.sin((installationIndex + 3) * 1.71 + intervalIndex * 0.17));
  return Number(Math.min(capacityKw, capacityKw * daylight * cloud).toFixed(3));
}

function timestampFor(endAt, intervalIndex, count = 672) {
  return new Date(endAt.getTime() - ((count - 1 - intervalIndex) * 15 * 60 * 1000));
}

module.exports = { provinces, stableHex, objectIdFor, generatedPower, timestampFor, deriveDeviceSecret };
