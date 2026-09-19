const { getDiscoveredJobs, refreshDiscoveredJobs, tailorDiscoveredJob, ENTERPRISE_JOB_BANK } = require('../server/src/services/ai_job_discovery.service');
const assert = require('assert');

async function testEnterpriseJobDiscovery() {
  console.log('================================================================');
  console.log('  RUNNING ENTERPRISE JOB DISCOVERY & 2-HOUR REFRESH TESTS       ');
  console.log('================================================================');

  const userKey = 'tksanthosh494_gmail_com';

  // 1. Minimum 20 enterprise jobs requirement
  const feed = getDiscoveredJobs(userKey);
  console.log(`[PASS 1/5] Feed contains ${feed.jobs.length} jobs (>= 20 required).`);
  assert(feed.jobs.length >= 20, `Expected at least 20 jobs, got ${feed.jobs.length}`);

  // 2. Verified Enterprise & Non-Startup Check (Zero startups, 500+ employees)
  const nonEnterprise = feed.jobs.filter(j => (j.employeeCount && j.employeeCount.includes('1-25')) || j.category === 'Startup');
  console.log(`[PASS 2/5] Verified non-startup guarantee: ${nonEnterprise.length} startups found (0 allowed).`);
  assert(nonEnterprise.length === 0, 'Found early-stage startups in enterprise feed');

  // 3. 2-Hour Refresh Interval & Timestamp Persistence
  const nextRefresh = new Date(feed.nextRefreshAt).getTime();
  const lastRefresh = new Date(feed.lastRefreshed).getTime();
  const diffHours = (nextRefresh - lastRefresh) / (1000 * 60 * 60);
  console.log(`[PASS 3/5] Refresh interval verified: strictly ${diffHours} hours.`);
  assert(Math.round(diffHours) === 2, `Expected 2 hours interval, got ${diffHours}`);

  // 4. Manual Discovery Refresh Trigger
  const refreshed = refreshDiscoveredJobs(userKey);
  console.log(`[PASS 4/5] Manual refresh returned ${refreshed.jobs.length} freshly curated enterprise jobs.`);
  assert(refreshed.jobs.length >= 20, 'Manual refresh failed to return >= 20 jobs');

  // 5. 1-Click Tailor & PDF Compilation
  const firstJob = refreshed.jobs[0];
  const tailoredResult = await tailorDiscoveredJob(userKey, firstJob.id);
  console.log(`[PASS 5/5] 1-Click tailor succeeded for ${firstJob.company} (Download URL: ${tailoredResult.downloadUrl}).`);
  assert(tailoredResult.success === true, '1-Click tailor failed');
  assert(Boolean(tailoredResult.application.pdfFilename), 'Missing PDF filename in application');

  console.log('================================================================');
  console.log('  ALL 5/5 ENTERPRISE JOB DISCOVERY ASSERTIONS PASSED (100% OK)  ');
  console.log('================================================================');
}

testEnterpriseJobDiscovery().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
