/**
 * Automated Verification Suite for Naukri Session Architecture
 * Tests:
 * 1. Complete Session Storage & Cold Browser Context Injection
 * 2. Render Container Restart & DB Hydration (Zero Ephemeral State Loss)
 * 3. Live Session Validation & Truthful State Machine Transitions
 * 4. Error Disambiguation: AUTH_RESTORE_FAILED (Case A) vs SESSION_EXPIRED (Case B)
 * 5. Mid-Run Queue Preservation during Easy Apply Expiry
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  saveNaukriSessionCookiesAsync,
  restoreAndInjectNaukriSession,
  validateNaukriSessionOnPage,
  getNaukriSessionStatusAsync,
  getNaukriConfigAsync,
  saveNaukriConfigAsync,
  clearNaukriSessionAsync,
  acquireUserLockAsync,
  releaseUserLockAsync,
  isUserLockedAsync
} = require('../src/services/naukri.service');

const {
  ApplicationState,
  getNaukriQueueAsync,
  saveNaukriQueueAsync,
  updateQueueItemState,
  updateQueueItemStateAsync
} = require('../src/services/naukri_apply.service');

const {
  ensureUserSandbox,
  getUserPaths,
  hydrateUserSandboxFromDatabase
} = require('../src/services/user.service');

const {
  isSupabaseConfigured,
  supabaseGetNaukriConfig,
  supabaseSaveNaukriConfig
} = require('../src/services/supabase.service');

const TEST_USER = 'test_session_user_' + Date.now();

// Mock Puppeteer Page for deterministic unit testing
class MockPuppeteerPage {
  constructor(initialCookies = []) {
    this._cookies = [...initialCookies];
    this._url = 'https://www.naukri.com/mnjuser/profile';
    this._title = 'Naukri Profile';
    this._pageContent = 'Mock Naukri Profile with resume and header details';
  }

  async cookies() {
    return [...this._cookies];
  }

  async setCookie(...cookies) {
    for (const c of cookies) {
      const idx = this._cookies.findIndex(existing => existing.name === c.name);
      if (idx >= 0) {
        this._cookies[idx] = { ...c };
      } else {
        this._cookies.push({ ...c });
      }
    }
  }

  async deleteCookie(...cookies) {
    const names = cookies.map(c => c.name);
    this._cookies = this._cookies.filter(c => !names.includes(c.name));
  }

  url() {
    return this._url;
  }

  setUrl(newUrl) {
    this._url = newUrl;
  }

  async title() {
    return this._title;
  }

  setTitle(newTitle) {
    this._title = newTitle;
  }

  async goto(targetUrl) {
    this._url = targetUrl;
    return { ok: () => true };
  }

  async evaluate(fn, ...args) {
    if (typeof fn === 'function') {
      const code = fn.toString();
      // If evaluating profile verification
      if (code.includes('mnjuser/profile') || code.includes('userType')) {
        const isLogin = this._url.includes('login') || this._url.includes('nlogin') || this._title.toLowerCase().includes('access denied');
        return {
          isLoggedIn: !isLogin,
          isLoginPage: isLogin,
          userName: isLogin ? null : 'Test Candidate',
          url: this._url,
          title: this._title,
          hasProfilePhoto: !isLogin
        };
      }
    }
    return null;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING NAUKRI SESSION ARCHITECTURE VERIFICATION TEST SUITE');
  console.log(`👤 Test User Key: ${TEST_USER}`);
  console.log(`☁️ Supabase Configured: ${isSupabaseConfigured()}`);
  console.log('===============================================================\n');

  ensureUserSandbox(TEST_USER);
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Complete Cookie Attribute Sanitization & Storage
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Complete Cookie Storage & Attribute Retention ---');
    const mockRawCookies = [
      {
        name: 'nauk_session',
        value: 'secure_auth_token_99998888',
        domain: '.naukri.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
      },
      {
        name: 'ubt_user',
        value: 'user_analytics_tracking_123',
        domain: '.naukri.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400 * 30,
        httpOnly: false,
        secure: true,
        sameSite: 'None'
      }
    ];

    const saveResult = await saveNaukriSessionCookiesAsync(TEST_USER, mockRawCookies, { status: 'ACTIVE' });
    assert(saveResult.success === true, 'saveNaukriSessionCookiesAsync returned success: true');
    assert(saveResult.cookieCount === 2, 'Stored exact count of 2 cookies');

    const statusAfterSave = await getNaukriSessionStatusAsync(TEST_USER);
    assert(statusAfterSave.status === 'ACTIVE' || statusAfterSave.status === 'CONFIGURED', `Truthful status reported (${statusAfterSave.status})`);
    assert(statusAfterSave.hasSession === true, 'hasSession is true');
    assert(statusAfterSave.storedInDb === isSupabaseConfigured(), 'Stored in cloud database matching configuration');

    // -------------------------------------------------------------------------
    // TEST 2: Cold Browser Context Injection & Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Cold Browser Context Injection Flow ---');
    const mockPage = new MockPuppeteerPage();
    const restoreResult = await restoreAndInjectNaukriSession(mockPage, TEST_USER);
    assert(restoreResult.hasSession === true, 'restoreAndInjectNaukriSession detected saved session');
    assert(restoreResult.injectedCount >= 2, `Injected ${restoreResult.injectedCount} cookies into browser context`);

    const injectedCookies = await mockPage.cookies();
    const hasNaukSession = injectedCookies.some(c => c.name === 'nauk_session' && c.value === 'secure_auth_token_99998888');
    assert(hasNaukSession, 'Browser context contains unaltered original nauk_session cookie');

    // -------------------------------------------------------------------------
    // TEST 3: Container Restart / Cache Loss Hydration Resiliency
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Container Restart & Database State Hydration ---');
    const paths = getUserPaths(TEST_USER);
    if (fs.existsSync(paths.naukriSessionPath)) fs.unlinkSync(paths.naukriSessionPath);
    if (fs.existsSync(paths.naukriConfigPath)) fs.unlinkSync(paths.naukriConfigPath);

    assert(!fs.existsSync(paths.naukriSessionPath), 'Local session file intentionally wiped (simulating ephemeral Render restart)');

    if (isSupabaseConfigured()) {
      await hydrateUserSandboxFromDatabase(TEST_USER);
      const restoredConfig = await getNaukriConfigAsync(TEST_USER);
      assert(restoredConfig.hasSession === true, 'Session restored from Supabase Cloud DB after container wipe');
      assert(Array.isArray(restoredConfig.sessionCookies) && restoredConfig.sessionCookies.length > 0, 'Encrypted cookies successfully decrypted and restored');
    } else {
      console.log('  ⚠️ Supabase not configured in local environment; skipping cloud DB restart check');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Live Session Validation & Error Disambiguation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Disambiguation: AUTH_RESTORE_FAILED vs SESSION_EXPIRED ---');
    // Case B: Expired session (Redirect to Login)
    mockPage.setUrl('https://www.naukri.com/nlogin/login');
    mockPage.setTitle('Jobseeker Login - Naukri.com');

    const validationExpired = await validateNaukriSessionOnPage(mockPage, TEST_USER);
    assert(validationExpired.isValid === false, 'Session on login page marked invalid');
    assert(validationExpired.reason === 'NAUKRI_LOGIN_REDIRECT' || validationExpired.status === 'EXPIRED', `Expired reason detected: ${validationExpired.reason}`);

    const statusAfterExpired = await getNaukriSessionStatusAsync(TEST_USER);
    assert(statusAfterExpired.status === 'EXPIRED', `Truthful status updated to EXPIRED (was ${statusAfterExpired.status})`);

    // Case A: Internal injection failure (Empty Page Context with Saved DB Cookies)
    const emptyFailPage = new MockPuppeteerPage();
    emptyFailPage.setCookie = async () => { throw new Error('Chromium rejected cookie injection'); };
    const restoreFailResult = await restoreAndInjectNaukriSession(emptyFailPage, TEST_USER);
    assert(restoreFailResult.failureType === 'AUTH_RESTORE_FAILED', `Internal failure correctly categorized as AUTH_RESTORE_FAILED (got ${restoreFailResult.failureType})`);

    // -------------------------------------------------------------------------
    // TEST 5: Distributed Concurrency Lock
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Distributed Concurrency Locking Lease ---');
    const lock1 = await acquireUserLockAsync(TEST_USER, 'test_worker_1', 10);
    assert(lock1 === true, 'Successfully acquired lease lock for test_worker_1');

    const lock2 = await acquireUserLockAsync(TEST_USER, 'test_worker_2', 10);
    assert(lock2 === false, 'Prevented concurrent duplicate lock acquisition for test_worker_2');

    const isLocked = await isUserLockedAsync(TEST_USER);
    assert(isLocked === true, 'isUserLockedAsync reports user is locked');

    await releaseUserLockAsync(TEST_USER, 'test_worker_1');
    const isLockedAfterRelease = await isUserLockedAsync(TEST_USER);
    assert(isLockedAfterRelease === false, 'isUserLockedAsync reports lock successfully released');

    // -------------------------------------------------------------------------
    // TEST 6: Mid-Run Easy Apply Session Expiry Queue Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Mid-Run Session Expiry Queue Retention ---');
    const mockQueue = [
      { jobId: 'job_001', jobTitle: 'Senior Frontend Engineer', company: 'Acme Corp', state: ApplicationState.SUBMITTED },
      { jobId: 'job_002', jobTitle: 'Fullstack Dev', company: 'Beta Labs', state: ApplicationState.QUEUED },
      { jobId: 'job_003', jobTitle: 'Software Architect', company: 'Gamma Tech', state: ApplicationState.QUEUED }
    ];

    await saveNaukriQueueAsync(TEST_USER, mockQueue);

    // Simulate session expiring while applying to job_002
    await updateQueueItemStateAsync(TEST_USER, 'job_002', {
      state: ApplicationState.AUTHENTICATION_REQUIRED,
      stage: 'Session Expired during Application (Authentication Required)',
      error: 'Naukri session expired'
    });

    const preservedQueue = await getNaukriQueueAsync(TEST_USER);
    const job1 = preservedQueue.find(q => q.jobId === 'job_001');
    const job2 = preservedQueue.find(q => q.jobId === 'job_002');
    const job3 = preservedQueue.find(q => q.jobId === 'job_003');

    assert(job1.state === ApplicationState.SUBMITTED, 'Job 1 retained completed SUBMITTED state (zero loss)');
    assert(job2.state === ApplicationState.AUTHENTICATION_REQUIRED, 'Job 2 marked AUTHENTICATION_REQUIRED');
    assert(job3.state === ApplicationState.QUEUED, 'Job 3 retained QUEUED state ready for post-re-auth resumption');

  } finally {
    // Cleanup test user sandbox
    try {
      await clearNaukriSessionAsync(TEST_USER);
      const testPaths = getUserPaths(TEST_USER);
      if (fs.existsSync(testPaths.userDir)) {
        fs.rmSync(testPaths.userDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  console.log('\n===============================================================');
  console.log(`📊 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
