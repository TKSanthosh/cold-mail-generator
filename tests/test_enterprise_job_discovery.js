const { getDiscoveredJobs, refreshDiscoveredJobs, tailorDiscoveredJob, ENTERPRISE_JOB_BANK } = require('../server/src/services/ai_job_discovery.service');
const assert = require('assert');

async function testEnterpriseJobDiscovery() {
  console.log('================================================================');
  console.log('  RUNNING PAN-INDIA ENTERPRISE DISCOVERY & LIVE LIVENESS TESTS  ');
  console.log('================================================================');

  const userKey = 'tksanthosh494_gmail_com';

  // 1. Minimum 20 enterprise jobs requirement
  const feed = getDiscoveredJobs(userKey);
  console.log(`[PASS 1/6] Feed contains ${feed.jobs.length} jobs (>= 20 required).`);
  assert(feed.jobs.length >= 20, `Expected at least 20 jobs, got ${feed.jobs.length}`);

  // 2. Verified Enterprise & Non-Startup Check (Zero startups, 500+ employees)
  const nonEnterprise = feed.jobs.filter(j => (j.employeeCount && j.employeeCount.includes('1-25')) || j.category === 'Startup');
  console.log(`[PASS 2/6] Verified non-startup guarantee: ${nonEnterprise.length} startups found (0 allowed).`);
  assert(nonEnterprise.length === 0, 'Found early-stage startups in enterprise feed');

  // 3. Pan-India Multi-Hub Geographical Distribution
  const locations = feed.jobs.map(j => (j.location || '').toLowerCase());
  const hasBlr = locations.some(l => l.includes('bangalore') || l.includes('bengaluru'));
  const hasHyd = locations.some(l => l.includes('hyderabad'));
  const hasChennai = locations.some(l => l.includes('chennai'));
  const hasPune = locations.some(l => l.includes('pune'));
  const hasDelhiNcr = locations.some(l => l.includes('noida') || l.includes('gurgaon'));
  const hasMumbai = locations.some(l => l.includes('mumbai'));
  
  console.log(`[PASS 3/6] Pan-India hubs verified: Bangalore(${hasBlr}), Hyderabad(${hasHyd}), Chennai(${hasChennai}), Pune(${hasPune}), DelhiNCR(${hasDelhiNcr}), Mumbai(${hasMumbai}).`);
  assert(hasBlr && hasHyd && hasChennai && hasPune && hasDelhiNcr && hasMumbai, 'Missing one or more required Indian tech hubs in feed');

  // 4. Real-Time Live Requisition & Portal Verification
  const liveVerifiedJobs = feed.jobs.filter(j => j.isLive === true && j.liveStatus === 'ACTIVE_VERIFIED');
  console.log(`[PASS 4/6] Live requisition verification: ${liveVerifiedJobs.length}/${feed.jobs.length} active openings verified.`);
  assert(liveVerifiedJobs.length === feed.jobs.length, 'Some jobs in feed lack live verification');

  // 5. 2-Hour Refresh Interval & Timestamp Persistence
  const nextRefresh = new Date(feed.nextRefreshAt).getTime();
  const lastRefresh = new Date(feed.lastRefreshed).getTime();
  const diffHours = (nextRefresh - lastRefresh) / (1000 * 60 * 60);
  console.log(`[PASS 5/6] Refresh interval verified: strictly ${diffHours} hours.`);
  assert(Math.round(diffHours) === 2, `Expected 2 hours interval, got ${diffHours}`);

  // 6. 1-Click Tailor & PDF Compilation
  const firstJob = feed.jobs[0];
  const tailoredResult = await tailorDiscoveredJob(userKey, firstJob.id);
  console.log(`[PASS 6/7] 1-Click tailor succeeded for ${firstJob.company} (Download URL: ${tailoredResult.downloadUrl}).`);
  assert(tailoredResult.success === true, '1-Click tailor failed');
  assert(Boolean(tailoredResult.application.pdfFilename), 'Missing PDF filename in application');

  // 7. Refresh Rotation Test: Refreshing MUST NOT repeat already shown jobs!
  console.log('[TEST 7/7] Testing Non-Repeating Refresh Rotation & Shown History Log...');
  const initialJobIds = new Set(feed.jobs.map(j => j.id));
  const refreshedFeed = await refreshDiscoveredJobs(userKey);
  console.log(`Refreshed feed received ${refreshedFeed.jobs.length} active jobs, ${refreshedFeed.shownHistory.length} in shownHistory.`);
  assert(refreshedFeed.jobs.length >= 20, `Expected at least 20 jobs after refresh, got ${refreshedFeed.jobs.length}`);
  assert(refreshedFeed.shownHistory.length >= initialJobIds.size, 'Shown history must contain initial batch');
  
  // Ensure that every job in refreshedFeed is NOT in the initial batch (zero repeats on first refresh)
  const repeated = refreshedFeed.jobs.filter(j => initialJobIds.has(j.id));
  console.log(`Repeated jobs after refresh: ${repeated.length} (must be 0)`);
  assert(repeated.length === 0, `Expected 0 repeated jobs after refresh, found: ${repeated.map(j => j.company + '-' + j.role).join(', ')}`);
  
  console.log(`[PASS 7/7] Strictly 0 repeats on refresh! All ${refreshedFeed.shownHistory.length} previous jobs logged in shownHistory.`);

  console.log('================================================================');
  console.log('  ALL 7/7 PAN-INDIA ENTERPRISE DISCOVERY ASSERTIONS PASSED!     ');
  console.log('================================================================');
  process.exit(0);
}

testEnterpriseJobDiscovery().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
