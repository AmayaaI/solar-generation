const { generatedPower, timestampFor, provinces, deriveDeviceSecret } = require('../src/seed/dataset');

describe('deterministic seed helpers', () => {
  test('includes all Sri Lankan provinces and districts', () => {
    expect(provinces).toHaveLength(9);
    expect(provinces.reduce((sum, province) => sum + province.districts.length, 0)).toBe(25);
  });

  test('solar output is zero overnight and never exceeds capacity', () => {
    expect(generatedPower(5, 2, 1, 1)).toBe(0);
    expect(generatedPower(5, 12, 1, 1)).toBeLessThanOrEqual(5);
    expect(generatedPower(5, 12, 1, 1)).toBe(generatedPower(5, 12, 1, 1));
  });

  test('builds the requested 15-minute time steps', () => {
    const end = new Date('2026-10-05T12:00:00.000Z');
    expect(timestampFor(end, 671).toISOString()).toBe(end.toISOString());
    expect(timestampFor(end, 670).getTime()).toBe(end.getTime() - 15 * 60 * 1000);
  });

  test('derives a distinct demonstration secret for each meter identity', () => {
    expect(deriveDeviceSecret('master-secret', 'slsea-0001')).not.toBe(deriveDeviceSecret('master-secret', 'slsea-0002'));
    expect(deriveDeviceSecret('master-secret', 'slsea-0001')).toBe(deriveDeviceSecret('master-secret', 'SLSEA-0001'));
  });
});
