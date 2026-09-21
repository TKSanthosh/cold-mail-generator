/**
 * INTEGRATION TEST SUITE: Deduplication, Company Exclusion, and Scrape AI Recruiter Discovery
 */

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const {
  isCompanyOrDomainExcluded,
  assertCompanyNotExcluded,
  getExcludedCompanies
} = require('../server/src/services/company_exclusion.service');

const {
  isAlreadyContacted,
  assertNotAlreadyContacted,
  hasAlreadySentToHr,
  recordSentHr,
  getSentHrRegistry,
  assertNotSentToHr,
  normalizeUrl,
  normalizeEmail
} = require('../server/src/services/dedup.service');

const {
  findRealRecruiterWithScrapeAi,
  generateRecruiterEmailVariations
} = require('../server/src/services/scrape_ai.service');

const { addUserLog } = require('../server/src/services/user.service');
const {
  isGenericHrEmail,
  verifyEmailDeliverability
} = require('../server/src/services/email_verifier.service');
const {
  sendGmail,
  createGmailDraft
} = require('../server/src/services/mail.service');

console.log('--- STARTING DEDUP, EXCLUSION & SCRAPE AI TEST SUITE ---\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`[FAIL] ${name}: ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (e) {
    console.error(`[FAIL] ${name}: ${e.message}`);
  }
}

async function run() {
  // --- 1. COMPANY EXCLUSION TESTS ---
  console.log('>>> Testing Company Exclusion Service (Present: IQVIA, Past: Sify Technologies)...');

  test('IQVIA company name is strictly excluded (Present company)', () => {
    const res = isCompanyOrDomainExcluded('IQVIA');
    assert.strictEqual(res.excluded, true);
    assert.strictEqual(res.type, 'PRESENT_COMPANY');
    assert.strictEqual(res.matchedCompany, 'IQVIA');
  });

  test('IQVIA with location ("IQVIA, Bangalore") is excluded', () => {
    const res = isCompanyOrDomainExcluded('IQVIA, Bangalore');
    assert.strictEqual(res.excluded, true);
    assert.strictEqual(res.matchedCompany, 'IQVIA');
  });

  test('IQVIA domain email ("recruiter@iqvia.com") is excluded', () => {
    const res = isCompanyOrDomainExcluded('', 'recruiter@iqvia.com');
    assert.strictEqual(res.excluded, true);
    assert.strictEqual(res.matchedCompany, 'IQVIA');
  });

  test('Sify Technologies company name is strictly excluded (Past company)', () => {
    const res = isCompanyOrDomainExcluded('Sify Technologies');
    assert.strictEqual(res.excluded, true);
    assert.strictEqual(res.type, 'PAST_COMPANY');
    assert.strictEqual(res.matchedCompany, 'Sify Technologies');
  });

  test('Sify alias ("Sify") is excluded', () => {
    const res = isCompanyOrDomainExcluded('Sify');
    assert.strictEqual(res.excluded, true);
  });

  test('Sify domain ("careers@sifycorp.com") is excluded', () => {
    const res = isCompanyOrDomainExcluded('', 'careers@sifycorp.com');
    assert.strictEqual(res.excluded, true);
  });

  test('Sify portal URL ("https://careers.sify.com/openings") is excluded', () => {
    const res = isCompanyOrDomainExcluded('', '', 'https://careers.sify.com/openings');
    assert.strictEqual(res.excluded, true);
  });

  test('Non-excluded company ("Juspay") is allowed', () => {
    const res = isCompanyOrDomainExcluded('Juspay', 'anjana.v@juspay.com');
    assert.strictEqual(res.excluded, false);
  });

  test('assertCompanyNotExcluded throws EXCLUDED_COMPANY for IQVIA', () => {
    assert.throws(
      () => assertCompanyNotExcluded('IQVIA'),
      (err) => err.code === 'EXCLUDED_COMPANY'
    );
  });

  test('assertCompanyNotExcluded throws EXCLUDED_COMPANY for Sify', () => {
    assert.throws(
      () => assertCompanyNotExcluded('Sify Technologies'),
      (err) => err.code === 'EXCLUDED_COMPANY'
    );
  });

  // --- 2. DEDUPLICATION TESTS ---
  console.log('\n>>> Testing Outreach Deduplication Service...');

  const testUser = `test_dedup_user_${Date.now()}`;
  const testCareerUrl = 'https://jobs.example.com/posting/fullstack-engineer-101?utm_source=linkedin&ref=board';

  test('normalizeUrl strips tracking parameters', () => {
    const normalized = normalizeUrl(testCareerUrl);
    assert.strictEqual(normalized, 'https://jobs.example.com/posting/fullstack-engineer-101');
  });

  test('Single email contact logging & duplicate interception', () => {
    const email = 'candidate.recruiter@examplecorp.com';
    // Initially not contacted
    const beforeCheck = isAlreadyContacted(testUser, { email, url: testCareerUrl });
    assert.strictEqual(beforeCheck.alreadyContacted, false);

    // Record an outreach log
    addUserLog(testUser, {
      type: 'Single Email',
      email,
      hrEmail: email,
      company: 'ExampleCorp',
      status: 'Sent',
      sourceUrl: testCareerUrl
    });

    // Now it should be blocked as duplicate email
    const afterCheckEmail = isAlreadyContacted(testUser, { email });
    assert.strictEqual(afterCheckEmail.alreadyContacted, true);
    assert.strictEqual(afterCheckEmail.type, 'EMAIL_DUPLICATE');

    // And blocked as duplicate careers page URL
    const afterCheckUrl = isAlreadyContacted(testUser, { url: 'https://jobs.example.com/posting/fullstack-engineer-101?utm_medium=email' });
    assert.strictEqual(afterCheckUrl.alreadyContacted, true);
    assert.strictEqual(afterCheckUrl.type, 'CAREER_PAGE_DUPLICATE');
  });

  test('assertNotAlreadyContacted throws DUPLICATE_CONTACT_BLOCKED', () => {
    const email = 'candidate.recruiter@examplecorp.com';
    assert.throws(
      () => assertNotAlreadyContacted(testUser, { email }),
      (err) => err.code === 'DUPLICATE_CONTACT_BLOCKED'
    );
  });

  // --- 3. SCRAPE AI RECRUITER DISCOVERY TESTS ---
  console.log('\n>>> Testing Scrape AI Recruiter Email Discovery...');

  await asyncTest('Scrape AI finds real recruiter email for Juspay (anjana.v@juspay.com)', async () => {
    const res = await findRealRecruiterWithScrapeAi('Juspay');
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.recruiterName, 'Anjana V');
    assert.strictEqual(res.email, 'anjana.v@juspay.com');
    assert.strictEqual(res.isPersonalRecruiter, true);
    // Crucial check: must NOT be generic hr@ or careers@
    assert(!res.email.startsWith('hr@'), 'Email is not generic hr@');
    assert(!res.email.startsWith('careers@'), 'Email is not generic careers@');
  });

  await asyncTest('Scrape AI finds real recruiter for Swiggy (pooja.sharma@swiggy.in)', async () => {
    const res = await findRealRecruiterWithScrapeAi('Swiggy');
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.recruiterName, 'Pooja Sharma');
    assert.strictEqual(res.email, 'pooja.sharma@swiggy.in');
    assert.strictEqual(res.isPersonalRecruiter, true);
  });

  await asyncTest('Scrape AI finds real recruiter for Razorpay (rohan.d@razorpay.com)', async () => {
    const res = await findRealRecruiterWithScrapeAi('Razorpay');
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.recruiterName, 'Rohan Deshmukh');
    assert.strictEqual(res.email, 'rohan.d@razorpay.com');
    assert.strictEqual(res.isPersonalRecruiter, true);
  });

  await asyncTest('Scrape AI strictly refuses to scrape or contact IQVIA (Present company)', async () => {
    let failedAsExpected = false;
    try {
      await findRealRecruiterWithScrapeAi('IQVIA');
    } catch (err) {
      failedAsExpected = true;
      assert(err.message.includes('Company Excluded') || err.message.includes('present'), 'Error notes present company');
    }
    assert.strictEqual(failedAsExpected, true, 'Scrape AI threw error for IQVIA');
  });

  await asyncTest('Scrape AI strictly refuses to scrape or contact Sify Technologies (Past company)', async () => {
    let failedAsExpected = false;
    try {
      await findRealRecruiterWithScrapeAi('Sify Technologies');
    } catch (err) {
      failedAsExpected = true;
      assert(err.message.includes('Company Excluded') || err.message.includes('past'), 'Error notes past company');
    }
    assert.strictEqual(failedAsExpected, true, 'Scrape AI threw error for Sify');
  });

  test('generateRecruiterEmailVariations generates firstname.initial, firstname.lastname, etc.', () => {
    const variations = generateRecruiterEmailVariations('Anjana Verma', 'juspay.com');
    assert(variations.includes('anjana.verma@juspay.com'), 'Includes firstname.lastname');
    assert(variations.includes('anjana.v@juspay.com'), 'Includes firstname.initial');
    assert(variations.includes('anjana@juspay.com'), 'Includes firstname');
  });

  // --- 4. REAL RECRUITER VS GENERIC HR TESTS ---
  console.log('\n>>> Testing Real Recruiter Enforcement vs Generic HR Email Blocking...');

  test('isGenericHrEmail identifies generic inboxes (hr, careers, jobs, talent, info, etc.)', () => {
    assert.strictEqual(isGenericHrEmail('hr@juspay.com'), true);
    assert.strictEqual(isGenericHrEmail('careers@juspay.com'), true);
    assert.strictEqual(isGenericHrEmail('careers-india@juspay.com'), true);
    assert.strictEqual(isGenericHrEmail('jobs@razorpay.com'), true);
    assert.strictEqual(isGenericHrEmail('talent@phonepe.com'), true);
    assert.strictEqual(isGenericHrEmail('talentacquisition@swiggy.in'), true);
    assert.strictEqual(isGenericHrEmail('hiring@zomato.com'), true);
    assert.strictEqual(isGenericHrEmail('tech-hiring@freshworks.com'), true);
    assert.strictEqual(isGenericHrEmail('info@cred.club'), true);
    assert.strictEqual(isGenericHrEmail('resumes@urbancompany.com'), true);
  });

  test('isGenericHrEmail allows real named recruiter emails', () => {
    assert.strictEqual(isGenericHrEmail('anjana.v@juspay.com'), false);
    assert.strictEqual(isGenericHrEmail('pooja.sharma@swiggy.in'), false);
    assert.strictEqual(isGenericHrEmail('rohan.d@razorpay.com'), false);
    assert.strictEqual(isGenericHrEmail('neha.nair@phonepe.com'), false);
    assert.strictEqual(isGenericHrEmail('karan.m@zomato.com'), false);
    assert.strictEqual(isGenericHrEmail('siddharth.rao@freshworks.com'), false);
  });

  await asyncTest('sendGmail strictly throws GENERIC_HR_BLOCKED on generic inboxes', async () => {
    let failedAsExpected = false;
    let errorCode = null;
    try {
      await sendGmail('hr@juspay.com', 'Application', 'Hello', null, 'test_user');
    } catch (err) {
      failedAsExpected = true;
      errorCode = err.code;
    }
    assert.strictEqual(failedAsExpected, true, 'sendGmail threw error for hr@');
    assert.strictEqual(errorCode, 'GENERIC_HR_BLOCKED', 'Error code is GENERIC_HR_BLOCKED');
  });

  await asyncTest('sendGmail blocks careers@ generic inboxes', async () => {
    let failedAsExpected = false;
    let errorCode = null;
    try {
      await sendGmail('careers@swiggy.in', 'Application', 'Hello', null, 'test_user');
    } catch (err) {
      failedAsExpected = true;
      errorCode = err.code;
    }
    assert.strictEqual(failedAsExpected, true, 'sendGmail threw error for careers@');
    assert.strictEqual(errorCode, 'GENERIC_HR_BLOCKED');
  });

  await asyncTest('createGmailDraft strictly throws GENERIC_HR_BLOCKED on generic inboxes', async () => {
    let failedAsExpected = false;
    let errorCode = null;
    try {
      await createGmailDraft('jobs@phonepe.com', 'Application', 'Hello', null, 'test_user');
    } catch (err) {
      failedAsExpected = true;
      errorCode = err.code;
    }
    assert.strictEqual(failedAsExpected, true, 'createGmailDraft threw error for jobs@');
    assert.strictEqual(errorCode, 'GENERIC_HR_BLOCKED');
  });

  // --- 5. COMPLETE HR LOG & DUPLICATE PREVENTION FLOW ---
  console.log('\n>>> Testing End-to-End HR Log & Duplicate Interception Workflow...');

  const testUserKey = `flow_test_user_${Date.now()}`;
  const hr1 = `anjana.recruiter.${Date.now()}@juspay.com`;
  const hr2 = `pooja.talent.${Date.now()}@swiggy.in`;

  test('Step 1: Check before sending - HR1 not contacted yet', () => {
    const checkBefore = hasAlreadySentToHr(testUserKey, hr1);
    assert.strictEqual(checkBefore.alreadySent, false, 'HR1 is not yet in the log');
  });

  await asyncTest('Step 2: Send to HR1 when not sent yet - succeeds and logs it', async () => {
    const res = await sendGmail(hr1, 'Full Stack Role', 'Hello Anjana', null, testUserKey, 'resume.pdf', {
      hrName: 'Anjana V',
      company: 'Juspay'
    });
    assert(res.id, 'Email was sent');

    // Verify it is now logged
    const checkAfter = hasAlreadySentToHr(testUserKey, hr1);
    assert.strictEqual(checkAfter.alreadySent, true, 'HR1 is now recorded in sent log');
    assert.strictEqual(checkAfter.contact.email, hr1);
    assert.strictEqual(checkAfter.contact.company, 'Juspay');
  });

  await asyncTest('Step 3: Try to send again to same HR1 - strictly blocked by pre-send check', async () => {
    let blockedAsExpected = false;
    let errCode = null;
    try {
      await sendGmail(hr1, 'Follow-up / Duplicate', 'Hello again', null, testUserKey, 'resume.pdf', {
        hrName: 'Anjana V',
        company: 'Juspay'
      });
    } catch (err) {
      blockedAsExpected = true;
      errCode = err.code;
      assert(err.message.includes('Duplicate HR Outreach Blocked'), 'Message explains duplicate to same HR blocked');
    }
    assert.strictEqual(blockedAsExpected, true, 'Second email to same HR was intercepted');
    assert.strictEqual(errCode, 'DUPLICATE_HR_EMAIL_BLOCKED', 'Error code is DUPLICATE_HR_EMAIL_BLOCKED');
  });

  test('Step 4: Check before sending to HR2 (different HR) - not contacted yet', () => {
    const checkHr2 = hasAlreadySentToHr(testUserKey, hr2);
    assert.strictEqual(checkHr2.alreadySent, false, 'HR2 is not yet in the log');
  });

  await asyncTest('Step 5: Send to HR2 - succeeds and logs it', async () => {
    const res = await sendGmail(hr2, 'Full Stack Role', 'Hello Pooja', null, testUserKey, 'resume.pdf', {
      hrName: 'Pooja Sharma',
      company: 'Swiggy'
    });
    assert(res.id, 'Email to HR2 was sent');

    const checkHr2After = hasAlreadySentToHr(testUserKey, hr2);
    assert.strictEqual(checkHr2After.alreadySent, true, 'HR2 is now recorded in sent log');
  });

  await asyncTest('Step 6: Try to send again to HR2 - strictly blocked by pre-send check', async () => {
    let blockedAsExpected = false;
    try {
      await sendGmail(hr2, 'Duplicate Swiggy Email', 'Hello Pooja again', null, testUserKey, 'resume.pdf', {
        hrName: 'Pooja Sharma',
        company: 'Swiggy'
      });
    } catch (err) {
      blockedAsExpected = true;
      assert.strictEqual(err.code, 'DUPLICATE_HR_EMAIL_BLOCKED');
    }
    assert.strictEqual(blockedAsExpected, true, 'Second email to HR2 was intercepted');
  });

  console.log(`\n==============================================`);
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log(`==============================================`);

  if (passed === total) {
    console.log('\n✅ ALL INTEGRATION TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

run();
