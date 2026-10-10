const { deriveDeviceSecret } = require('./dataset');

const master = process.env.SEED_DEVICE_SECRET;
const meterId = process.argv[2];
if (!master || Buffer.byteLength(master, 'utf8') < 32 || Buffer.byteLength(master, 'utf8') > 72) {
  console.error('Set SEED_DEVICE_SECRET to a private random value of 32 to 72 UTF-8 bytes.');
  process.exitCode = 1;
} else if (!meterId) {
  console.error('Supply the normalized meter ID, for example SLSEA-0001.');
  process.exitCode = 1;
} else {
  process.stdout.write(`${deriveDeviceSecret(master, meterId)}\n`);
}
