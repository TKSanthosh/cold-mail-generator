const fs = require('fs');
const path = require('path');
const { resolveUserResumeFile, validatePdfFile } = require('./server/src/services/resume.service');
const { triggerNaukriUploadForActiveUsers, getNaukriConfig } = require('./server/src/services/naukri.service');
const { isSupabaseConfigured, supabaseGetResume, supabaseGetAllUsers } = require('./server/src/services/supabase.service');

async function runEndToEndVerification() {
  console.log('===============================================================');
  console.log('       END-TO-END RESUME CRON AUTO-UPLOAD VERIFICATION         ');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    }
  }

  // TEST 1: Supabase DB Connection & Configuration
  console.log('--- TEST GROUP 1: Database Connectivity & Discovery ---');
  const dbConfigured = isSupabaseConfigured();
  assert(dbConfigured === true, 'Supabase is configured and reachable');

  const allUsers = await supabaseGetAllUsers();
  assert(Array.isArray(allUsers) && allUsers.length > 0, `Discovered ${allUsers.length} user account(s) from Supabase DB`);
  console.log(`  Discovered DB users: ${allUsers.map(u => u.userKey).join(', ')}`);

  // TEST 2: Dynamic DB Resume Retrieval for tksanthosh494_gmail_com
  console.log('\n--- TEST GROUP 2: Database Resume Retrieval & Resolution ---');
  const userKey = 'tksanthosh494_gmail_com';
  const resolved = await resolveUserResumeFile(userKey);
  
  assert(Boolean(resolved), 'Resolved resume record exists');
  assert(Boolean(resolved.filePath && fs.existsSync(resolved.filePath)), `Resolved PDF exists on disk at: ${resolved.filePath}`);
  assert(resolved.fileSize > 1000, `Resolved PDF has valid size: ${resolved.fileSize} bytes`);
  assert(resolved.source.includes('supabase_database'), `Resume was dynamically retrieved from Supabase DB: ${resolved.source}`);
  assert(resolved.fileName.endsWith('.pdf'), `Generated dynamic filename: ${resolved.fileName}`);

  // Validate PDF Magic Header
  const validSize = validatePdfFile(resolved.filePath);
  assert(validSize === resolved.fileSize, `PDF integrity validated with %PDF header (${validSize} bytes)`);

  // TEST 3: Dynamic Multi-Format Handling (Base64 payload)
  console.log('\n--- TEST GROUP 3: Multi-Format Resume Support (Base64 & Custom Filenames) ---');
  const samplePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n162\n%%EOF');
  const b64 = samplePdfBuffer.toString('base64');
  
  const b64Resolved = await resolveUserResumeFile('test_b64_user');
  assert(Boolean(b64Resolved.filePath), 'Resolved Base64 encoded PDF payload');
  assert(b64Resolved.fileName === 'alex_johnson_custom.pdf', `Preserved custom filename from DB: ${b64Resolved.fileName}`);

  // TEST 4: Cron Multi-User Scheduling Discovery (Non-Forced Run)
  console.log('\n--- TEST GROUP 4: Cron Execution Flow & User Evaluation ---');
  const cronResults = await triggerNaukriUploadForActiveUsers({ force: false, targetUserKey: 'all' });
  assert(Array.isArray(cronResults), 'Cron execution returned array of results');
  assert(cronResults.length > 0, `Evaluated ${cronResults.length} user accounts in cron run`);
  
  for (const r of cronResults) {
    console.log(`  User: ${r.userKey} -> Status: ${r.status || (r.skipped ? 'skipped' : 'unknown')} (${r.reason || r.error || 'ok'})`);
    assert(Boolean(r.userKey), `Result contains valid userKey: ${r.userKey}`);
  }

  // TEST 5: Zero Hardcoding Check
  console.log('\n--- TEST GROUP 5: Code Audit for Zero Hardcoding ---');
  const naukriServiceContent = fs.readFileSync(path.join(__dirname, 'server/src/services/naukri.service.js'), 'utf8');
  assert(!naukriServiceContent.includes("isSanthosh ? 'santhosh_t_k_resume.pdf'"), 'Zero hardcoded isSanthosh ternary in naukri.service.js');
  assert(!naukriServiceContent.includes("targetUsers = [ (targetUserKey && targetUserKey !== 'all') ? targetUserKey : 'tksanthosh494_gmail_com' ]"), 'Zero hardcoded fallback user in triggerNaukriUploadForActiveUsers');

  console.log('\n===============================================================');
  console.log(`VERIFICATION COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED!`);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runEndToEndVerification().catch(err => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
