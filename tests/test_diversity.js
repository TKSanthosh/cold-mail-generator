const assert = require('assert');
const { 
  ENTERPRISE_JOB_BANK, 
  selectDiverseJobs, 
  getDiscoveredJobs, 
  resetShownJobsHistory, 
  refreshDiscoveredJobs 
} = require('../server/src/services/ai_job_discovery.service');

console.log('--- STARTING COMPANY DIVERSITY & JOB BANK TEST SUITE ---');

// 1. Verify that all 47 jobs in the enterprise job bank are distinct companies
console.log('>>> Checking ENTERPRISE_JOB_BANK uniqueness...');
assert.strictEqual(ENTERPRISE_JOB_BANK.length, 47, 'Bank should have 47 enterprise jobs');

const bankCompanies = new Set();
for (const j of ENTERPRISE_JOB_BANK) {
  const norm = (j.company || '').toLowerCase().trim();
  assert.ok(!bankCompanies.has(norm), `Duplicate company in ENTERPRISE_JOB_BANK: ${j.company}`);
  bankCompanies.add(norm);
}
assert.strictEqual(bankCompanies.size, 47, 'All 47 jobs in bank must be from unique companies');
console.log('[PASS] ENTERPRISE_JOB_BANK contains 47 distinct enterprise companies (Zero duplicates in bank)');

// 2. Test selectDiverseJobs algorithm
console.log('>>> Testing selectDiverseJobs interleaver...');
const mockJobs = [
  { id: '1', company: 'Chevron', role: 'Dev 1' },
  { id: '2', company: 'Chevron', role: 'Dev 2' },
  { id: '3', company: 'Okta', role: 'Dev 3' },
  { id: '4', company: 'Okta', role: 'Dev 4' },
  { id: '5', company: 'Comcast', role: 'Dev 5' },
  { id: '6', company: 'Fiserv', role: 'Dev 6' }
];

const diverseResult = selectDiverseJobs(mockJobs, 4, 1);
assert.strictEqual(diverseResult.length, 4, 'Should select 4 diverse jobs');
const compCounts = {};
diverseResult.forEach(j => compCounts[j.company] = (compCounts[j.company] || 0) + 1);
assert.strictEqual(Math.max(...Object.values(compCounts)), 1, 'Max jobs per company must be 1');
assert.deepStrictEqual(Object.keys(compCounts).sort(), ['Chevron', 'Comcast', 'Fiserv', 'Okta'].sort());
console.log('[PASS] selectDiverseJobs enforces strict maxPerCompany = 1');

// 3. Test active feed reset & discovery
console.log('>>> Testing active user discovery feed...');
const feed = resetShownJobsHistory('tksanthosh494_gmail_com');
assert.strictEqual(feed.jobs.length, 25, 'Active feed must display 25 jobs');

const feedCompCounts = {};
for (const j of feed.jobs) {
  feedCompCounts[j.company] = (feedCompCounts[j.company] || 0) + 1;
}
const maxActiveCount = Math.max(...Object.values(feedCompCounts));
assert.strictEqual(maxActiveCount, 1, 'No company may appear more than once in the active feed');
console.log('[PASS] Active feed has 25 distinct companies with 0 repetitions');

// 4. Verify specific companies mentioned by user are present
console.log('>>> Verifying requested companies presence...');
const allCompNames = ENTERPRISE_JOB_BANK.map(j => j.company.toLowerCase());
assert.ok(allCompNames.includes('comcast'), 'Comcast must be present in bank');
assert.ok(allCompNames.includes('fiserv'), 'Fiserv must be present in bank');
assert.ok(allCompNames.includes('firstsource'), 'Firstsource must be present in bank');
assert.ok(allCompNames.includes('chevron'), 'Chevron must be present in bank');
console.log('[PASS] Comcast, Fiserv, Firstsource, and Chevron are all verified in the enterprise bank');

console.log('\n==============================================');
console.log('✅ ALL DIVERSITY TESTS PASSED PERFECTLY!');
console.log('==============================================\n');
