const assert = require('assert');
const {
  calculateNextUploadTime,
  getNaukriConfig,
  saveNaukriConfig,
  getIstTime,
  createDateFromIst
} = require('../server/src/services/naukri.service');

console.log('\n================================================================================');
console.log('  NAUKRI EXACT TIMINGS & SCHEDULING VERIFICATION TEST SUITE');
console.log('================================================================================\n');

// 1. Verify Default Slots
const config = getNaukriConfig('tksanthosh494_gmail_com');
console.log('Current user schedule mode:', config.scheduleMode);
console.log('Current user slots:', config.slots);
console.log('Current user customSlots:', config.customSlots);

assert.deepStrictEqual(config.slots, ['10:00 AM', '01:00 PM', '04:00 PM', '06:00 PM'], 'Slots must be strictly 10 AM, 1 PM, 4 PM, 6 PM');
assert.deepStrictEqual(config.customSlots, ['10:00 AM', '01:00 PM', '04:00 PM', '06:00 PM'], 'CustomSlots must be strictly 10 AM, 1 PM, 4 PM, 6 PM');
console.log('  [PASS] 1. Config slots verified strictly as 10:00 AM, 01:00 PM, 04:00 PM, 06:00 PM IST');

// 2. Test Next Upload Calculations across IST Times
// Base: 2026-09-26 08:00 AM IST (02:30 UTC) -> should return 10:00 AM IST (04:30 UTC)
const d0800 = new Date('2026-09-26T02:30:00.000Z');
const nextAt0800 = calculateNextUploadTime(config, d0800);
assert.strictEqual(nextAt0800.toISOString(), '2026-09-26T04:30:00.000Z', '08:00 AM IST must yield 10:00 AM IST');
console.log('  [PASS] 2a. At 08:00 AM IST -> Next slot is 10:00 AM IST (04:30 UTC)');

// Base: 2026-09-26 10:00:01 AM IST (04:30:01 UTC) -> should return 01:00 PM IST (07:30 UTC)
const d1000 = new Date('2026-09-26T04:30:01.000Z');
const nextAt1000 = calculateNextUploadTime(config, d1000);
assert.strictEqual(nextAt1000.toISOString(), '2026-09-26T07:30:00.000Z', '10:00:01 AM IST must yield 01:00 PM IST');
console.log('  [PASS] 2b. At 10:00 AM IST -> Next slot is 01:00 PM IST (07:30 UTC)');

// Base: 2026-09-26 01:00:01 PM IST (07:30:01 UTC) -> should return 04:00 PM IST (10:30 UTC)
const d1300 = new Date('2026-09-26T07:30:01.000Z');
const nextAt1300 = calculateNextUploadTime(config, d1300);
assert.strictEqual(nextAt1300.toISOString(), '2026-09-26T10:30:00.000Z', '01:00:01 PM IST must yield 04:00 PM IST');
console.log('  [PASS] 2c. At 01:00 PM IST -> Next slot is 04:00 PM IST (10:30 UTC)');

// Base: 2026-09-26 04:00:01 PM IST (10:30:01 UTC) -> should return 06:00 PM IST (12:30 UTC)
const d1600 = new Date('2026-09-26T10:30:01.000Z');
const nextAt1600 = calculateNextUploadTime(config, d1600);
assert.strictEqual(nextAt1600.toISOString(), '2026-09-26T12:30:00.000Z', '04:00:01 PM IST must yield 06:00 PM IST');
console.log('  [PASS] 2d. At 04:00 PM IST -> Next slot is 06:00 PM IST (12:30 UTC)');

// Base: 2026-09-26 06:00:01 PM IST (12:30:01 UTC) -> should roll over to tomorrow 10:00 AM IST (04:30 UTC)
const d1800 = new Date('2026-09-26T12:30:01.000Z');
const nextAt1800 = calculateNextUploadTime(config, d1800);
assert.strictEqual(nextAt1800.toISOString(), '2026-09-27T04:30:00.000Z', '06:00:01 PM IST must yield tomorrow 10:00 AM IST');
console.log('  [PASS] 2e. At 06:00 PM IST -> Next slot is tomorrow 10:00 AM IST (04:30 UTC)');

// 3. Test that routine saveNaukriConfig does NOT overwrite or bump pending nextUploadAt
const originalNextUpload = '2026-09-26T04:30:00.000Z';
const testKey = 'test_timing_user_' + Date.now();
saveNaukriConfig(testKey, {
  ...config,
  nextUploadAt: originalNextUpload
});

// Perform routine save (e.g. updating headline or portfolio)
saveNaukriConfig(testKey, {
  lastStatus: 'Updated portfolio test',
  portfolio: { headline: 'New Headline' }
});

const reloadedConfig = getNaukriConfig(testKey);
assert.strictEqual(reloadedConfig.nextUploadAt, originalNextUpload, 'Routine save must NOT change or bump nextUploadAt');
console.log('  [PASS] 3. Routine saveNaukriConfig safely preserved pending nextUploadAt without premature advancement');

// Clean up test user
const fs = require('fs');
const { getUserPaths } = require('../server/src/services/user.service');
const testPaths = getUserPaths(testKey);
try {
  if (fs.existsSync(testPaths.naukriConfigPath)) fs.unlinkSync(testPaths.naukriConfigPath);
  if (fs.existsSync(testPaths.userDir)) fs.rmSync(testPaths.userDir, { recursive: true, force: true });
} catch (e) {}

console.log('\n================================================================================');
console.log('  ALL NAUKRI TIMING TESTS PASSED (10 AM, 1 PM, 4 PM, 6 PM IST STRICTLY ENFORCED)');
console.log('================================================================================\n');
