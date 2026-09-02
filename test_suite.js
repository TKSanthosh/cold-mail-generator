const fs = require('fs');
const path = require('path');

console.log('--- RUNNING COLD REACH AI COMPREHENSIVE TEST SUITE ---\n');

let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}`);
    failedTests++;
  }
}

// TEST 1: Check client/src/App.jsx JSX tags vs imports
try {
  const appCode = fs.readFileSync(path.join(__dirname, 'client/src/App.jsx'), 'utf8');
  const importMatch = appCode.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
  assert(importMatch !== null, 'Lucide React icons imported in App.jsx');
  
  const importedIcons = new Set(importMatch[1].split(',').map(s => s.trim()).filter(Boolean));
  const jsxTagMatches = [...appCode.matchAll(/<([A-Z][a-zA-Z0-9]+)[\s\/>]/g)];
  const internalComponents = new Set(['App', 'SingleSender', 'BulkSender', 'LogsViewer', 'ResumeEditor', 'JdResumeTailor', 'LinkedInAutoPilot', 'NaukriAutoUploader', 'AdminDashboard', 'LoginPage']);
  
  const missingIcons = [];
  for (const m of jsxTagMatches) {
    const tagName = m[1];
    if (!internalComponents.has(tagName) && !importedIcons.has(tagName)) {
      missingIcons.push(tagName);
    }
  }
  assert(missingIcons.length === 0, `All JSX icon components are defined (Missing: ${missingIcons.join(', ') || 'None'})`);
} catch (e) {
  assert(false, `Test 1 threw error: ${e.message}`);
}

// TEST 2: Check server services syntax and imports
try {
  const userService = require('./server/src/services/user.service');
  assert(typeof userService.getUserPaths === 'function', 'user.service exports getUserPaths');
  assert(typeof userService.getUserResume === 'function', 'user.service exports getUserResume');
  assert(typeof userService.isUserAuthorized === 'function', 'user.service exports isUserAuthorized');
  assert(typeof userService.getUserApplications === 'function', 'user.service exports getUserApplications');
  assert(typeof userService.getUserLogs === 'function', 'user.service exports getUserLogs');
  assert(typeof userService.syncUserLogs === 'function', 'user.service exports syncUserLogs');
  assert(typeof userService.syncUserApplications === 'function', 'user.service exports syncUserApplications');

  const storageService = require('./server/src/services/storage.service');
  assert(typeof storageService.readCompressedJson === 'function', 'storage.service exports readCompressedJson');
  assert(typeof storageService.writeCompressedJson === 'function', 'storage.service exports writeCompressedJson');
  assert(typeof storageService.createFullBackup === 'function', 'storage.service exports createFullBackup');
  assert(typeof storageService.restoreFullBackup === 'function', 'storage.service exports restoreFullBackup');
  assert(typeof storageService.appendGlobalLog === 'function', 'storage.service exports appendGlobalLog');
  assert(typeof storageService.getGlobalLogs === 'function', 'storage.service exports getGlobalLogs');

  const llmService = require('./server/src/services/llm.service');
  assert(typeof llmService.tailorResume === 'function', 'llm.service exports tailorResume');
  assert(typeof llmService.generateColdEmail === 'function', 'llm.service exports generateColdEmail');

  const { parseHrEmail } = require('./server/src/utils/parser');
  assert(typeof parseHrEmail === 'function', 'utils/parser exports parseHrEmail');

  const mailService = require('./server/src/services/mail.service');
  assert(typeof mailService.sendGmail === 'function', 'mail.service exports sendGmail');
  assert(typeof mailService.createGmailDraft === 'function', 'mail.service exports createGmailDraft');

  const pdfService = require('./server/src/services/pdf.service');
  assert(typeof pdfService.generateResumePdf === 'function', 'pdf.service exports generateResumePdf');

  const jwtService = require('./server/src/services/jwt.service');
  assert(typeof jwtService.generateTokens === 'function', 'jwt.service exports generateTokens');
  assert(typeof jwtService.verifyAccessToken === 'function', 'jwt.service exports verifyAccessToken');
} catch (e) {
  assert(false, `Test 2 threw error: ${e.message}`);
}

// TEST 3: Check Compressed Storage Engine Integrity
try {
  const { writeCompressedJson, readCompressedJson } = require('./server/src/services/storage.service');
  const testGz = path.join(__dirname, 'server/users/test_gz_unit.json.gz');
  const testJson = path.join(__dirname, 'server/users/test_gz_unit.json');
  const testData = [{ id: '1', name: 'Test Record', list: [1, 2, 3] }];

  writeCompressedJson(testGz, testJson, testData);
  assert(fs.existsSync(testGz), 'Gzip binary file created successfully');
  
  const readData = readCompressedJson(testGz, testJson, []);
  assert(Array.isArray(readData) && readData.length === 1 && readData[0].name === 'Test Record', 'Gzip decompression matches original data');
  
  // Cleanup test files
  if (fs.existsSync(testGz)) fs.unlinkSync(testGz);
  if (fs.existsSync(testJson)) fs.unlinkSync(testJson);
} catch (e) {
  assert(false, `Test 3 threw error: ${e.message}`);
}

// TEST 4: Parse Email Helper Integrity
try {
  const { parseHrEmail } = require('./server/src/utils/parser');
  const p1 = parseHrEmail('santhosh@google.com');
  assert(p1.company.toLowerCase() === 'google', `HR email parse company: ${p1.company}`);
  assert(p1.name === 'Santhosh', `HR email parse name: ${p1.name}`);
} catch (e) {
  assert(false, `Test 4 threw error: ${e.message}`);
}

// TEST 5: Resume Tailoring & ATS Keyword Injection Validation
try {
  const masterResume = JSON.parse(fs.readFileSync(path.join(__dirname, 'server/resume.json'), 'utf8'));
  assert(masterResume.personalInfo.name.includes('Santhosh'), 'Master resume has canonical name');
  assert(masterResume.personalInfo.title.includes('Software Development Engineer'), 'Master resume has correct title format');
} catch (e) {
  assert(false, `Test 5 threw error: ${e.message}`);
}

// TEST 6: JWT 30-Day Token Generation & Verification
try {
  const { generateTokens, verifyAccessToken, verifyRefreshToken } = require('./server/src/services/jwt.service');
  const mockUser = { userKey: 'tksanthosh494_gmail_com', email: 'tksanthosh494@gmail.com' };
  const tokens = generateTokens(mockUser);
  assert(typeof tokens.accessToken === 'string', 'Access token generated');
  assert(typeof tokens.refreshToken === 'string', 'Refresh token generated');
  
  const decodedAccess = verifyAccessToken(tokens.accessToken);
  assert(decodedAccess.userKey === mockUser.userKey, 'Access token verified with correct userKey');
  
  const decodedRefresh = verifyRefreshToken(tokens.refreshToken);
  assert(decodedRefresh.userKey === mockUser.userKey, 'Refresh token verified with correct userKey');
} catch (e) {
  assert(false, `Test 6 threw error: ${e.message}`);
}

// TEST 7: Strict 1-Page PDF Generation Verification (Zero Spill / No Empty 2nd Page)
async function testPdfSinglePage() {
  try {
    const { generateResumePdf } = require('./server/src/services/pdf.service');
    const masterResume = JSON.parse(fs.readFileSync(path.join(__dirname, 'server/resume.json'), 'utf8'));
    masterResume.atsKeywords = ['MERN Stack', 'MongoDB', 'Express.js', 'React.js', 'Node.js', 'JavaScript', 'ES6+', 'REST APIs', 'AWS', 'Docker', 'CI/CD'];
    
    const testPdfPath = path.join(__dirname, `test_single_page_${Date.now()}_${Math.random().toString(36).substr(2, 4)}.pdf`);
    await generateResumePdf(masterResume, testPdfPath);
    
    const pdfContent = fs.readFileSync(testPdfPath, 'binary');
    const pageCount = (pdfContent.match(/\/Type\s*\/Page\b/g) || []).length;
    
    assert(pageCount === 1, `PDF generated strictly on 1 page (Actual page count: ${pageCount})`);
    
    if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
  } catch (e) {
    assert(false, `Test 7 threw error: ${e.message}`);
  }

  // TEST 8: Email Scheduler Integrity
  try {
    const { addScheduledJob, getScheduledJobs, cancelScheduledJob } = require('./server/src/services/schedule.service');
    const job = addScheduledJob({
      userKey: 'tksanthosh494_gmail_com',
      email: 'test@hr.com',
      subject: 'Test Schedule',
      scheduledAt: new Date(Date.now() + 100000).toISOString()
    });
    assert(job && job.id.startsWith('sched_'), 'Job added to scheduler with unique ID');
    
    const jobs = getScheduledJobs();
    assert(jobs.some(j => j.id === job.id), 'Scheduler retrieves active scheduled jobs');
    
    cancelScheduledJob(job.id);
    const updatedJobs = getScheduledJobs();
    assert(!updatedJobs.some(j => j.id === job.id), 'Scheduler successfully cancels job');
  } catch (e) {
    assert(false, `Test 8 threw error: ${e.message}`);
  }

  // TEST 9: LinkedIn Recruiter Harvester & Multi-Mode Scheduler Pipeline
  try {
    const { harvestRecruiterPosts, getLinkedInConfig, saveLinkedInConfig, calculateNextLinkedInRunTime, discoverLiveRecruiterPostsWithLlm } = require('./server/src/services/linkedin.service');
    assert(typeof calculateNextLinkedInRunTime === 'function', 'linkedin.service exports calculateNextLinkedInRunTime');
    assert(typeof discoverLiveRecruiterPostsWithLlm === 'function', 'linkedin.service exports discoverLiveRecruiterPostsWithLlm');

    const leads = await harvestRecruiterPosts('MERN Stack Developer React Node.js', 10);
    assert(Array.isArray(leads), 'LinkedIn harvester returns leads array');
    assert(leads.length >= 5, `Harvested minimum 5 recruiter leads (Found: ${leads.length})`);
    
    const firstLead = leads[0];
    assert(firstLead.email && firstLead.email.includes('@'), `Extracted valid recruiter email: ${firstLead.email}`);
    assert(firstLead.company && firstLead.company.length > 0, `Extracted company name: ${firstLead.company}`);
    assert(firstLead.postSnippet && firstLead.postSnippet.length > 0, 'Extracted recruiter post context snippet');

    const config = getLinkedInConfig();
    assert(typeof config === 'object', 'LinkedIn config loaded properly');
    assert(Array.isArray(config.customSlots), 'LinkedIn customSlots array initialized');

    // Test custom timings slot calculation
    const baseDate = new Date('2026-08-31T08:00:00.000Z');
    const nextCustomSlot = calculateNextLinkedInRunTime({
      scheduleMode: 'custom',
      customSlots: ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM']
    }, baseDate);
    assert(nextCustomSlot instanceof Date, 'Custom timing slot resolves valid Date instance');

    // Test interval calculation (e.g. 4 hours)
    const nextInterval = calculateNextLinkedInRunTime({
      scheduleMode: 'interval',
      intervalHours: 4,
      intervalMinutes: 240
    }, baseDate);
    assert(nextInterval.getTime() === baseDate.getTime() + 4 * 60 * 60 * 1000, 'LinkedIn 4-hour interval calculation verified');
  } catch (e) {
    assert(false, `Test 9 threw error: ${e.message}`);
  }

  // TEST 10: Supabase Integration & Schema Integrity
  try {
    const supabaseService = require('./server/src/services/supabase.service');
    assert(typeof supabaseService.isSupabaseConfigured === 'function', 'supabase.service exports isSupabaseConfigured');
    assert(typeof supabaseService.supabaseUpsertUser === 'function', 'supabase.service exports supabaseUpsertUser');
    assert(typeof supabaseService.supabaseGetAllUsers === 'function', 'supabase.service exports supabaseGetAllUsers');
    assert(typeof supabaseService.supabaseSaveResume === 'function', 'supabase.service exports supabaseSaveResume');
    assert(typeof supabaseService.supabaseAppendLog === 'function', 'supabase.service exports supabaseAppendLog');
    assert(typeof supabaseService.supabaseSaveApplications === 'function', 'supabase.service exports supabaseSaveApplications');
    assert(typeof supabaseService.supabaseSaveNaukriConfig === 'function', 'supabase.service exports supabaseSaveNaukriConfig');
    assert(typeof supabaseService.supabaseAppendNaukriHistory === 'function', 'supabase.service exports supabaseAppendNaukriHistory');
    assert(typeof supabaseService.supabaseSaveScheduledJob === 'function', 'supabase.service exports supabaseSaveScheduledJob');
    assert(typeof supabaseService.supabaseGetScheduledJobs === 'function', 'supabase.service exports supabaseGetScheduledJobs');
    assert(typeof supabaseService.supabaseDeleteScheduledJob === 'function', 'supabase.service exports supabaseDeleteScheduledJob');
    
    assert(fs.existsSync(path.join(__dirname, 'supabase_schema.sql')), 'supabase_schema.sql exists and is ready for 1-click execution');
    
    const userService = require('./server/src/services/user.service');
    assert(typeof userService.hydrateUserSandboxFromDatabase === 'function', 'user.service exports hydrateUserSandboxFromDatabase');
  } catch (e) {
    assert(false, `Test 10 threw error: ${e.message}`);
  }

  // TEST 11: Naukri Profile Booster & Quarter-Day Scheduler
  try {
    const naukriService = require('./server/src/services/naukri.service');
    assert(typeof naukriService.findBrowserExecutable === 'function', 'naukri.service exports findBrowserExecutable');
    assert(typeof naukriService.getNaukriConfig === 'function', 'naukri.service exports getNaukriConfig');
    assert(typeof naukriService.getNextQuarterDayTime === 'function', 'naukri.service exports getNextQuarterDayTime');
    assert(typeof naukriService.uploadResumeToNaukri === 'function', 'naukri.service exports uploadResumeToNaukri');
    assert(typeof naukriService.verifyNaukriOtp === 'function', 'naukri.service exports verifyNaukriOtp');
    assert(typeof naukriService.startInteractiveGoogleSsoLogin === 'function', 'naukri.service exports startInteractiveGoogleSsoLogin');
    
    const browserPath = naukriService.findBrowserExecutable();
    assert(browserPath !== undefined, `Browser executable discovered: ${browserPath || 'Puppeteer default (Render Linux)'}`);
    
    const nextSlot = naukriService.getNextQuarterDayTime();
    assert(nextSlot instanceof Date && nextSlot > new Date(), `Next Quarter-Day slot calculated: ${nextSlot.toLocaleTimeString()}`);

    assert(typeof naukriService.calculateNextUploadTime === 'function', 'naukri.service exports calculateNextUploadTime');
    const customNext = naukriService.calculateNextUploadTime({
      scheduleMode: 'custom',
      customSlots: ['09:30 AM', '02:15 PM', '06:45 PM', '11:00 PM']
    });
    assert(customNext instanceof Date && customNext > new Date(), `Custom Timings next slot calculated: ${customNext.toLocaleTimeString()}`);

    const config = naukriService.getNaukriConfig();
    assert(config.scheduleMode === 'quarter_day' || config.enabled !== undefined, 'Naukri Quarter-Day config verified');
    assert(Array.isArray(config.customSlots), 'Naukri customSlots array initialized');
  } catch (e) {
    assert(false, `Test 11 threw error: ${e.message}`);
  }

  // TEST 12: Anti-Sleep 24/7 Keep-Alive Heartbeat Service
  try {
    const keepAliveService = require('./server/src/services/keepalive.service');
    assert(typeof keepAliveService.initKeepAliveService === 'function', 'keepalive.service exports initKeepAliveService');
    assert(typeof keepAliveService.getKeepAliveStatus === 'function', 'keepalive.service exports getKeepAliveStatus');
    
    const status = keepAliveService.getKeepAliveStatus(5001);
    assert(status && status.enabled === true, 'Keep-Alive anti-sleep status active');
    assert(typeof status.pingInterval === 'string', 'Keep-Alive ping interval configured');
  } catch (e) {
    assert(false, `Test 12 threw error: ${e.message}`);
  }

  // TEST 13: Super Admin Control Center & Telemetry (tksanthosh494@gmail.com)
  try {
    const adminService = require('./server/src/services/admin.service');
    assert(typeof adminService.getAdminOverview === 'function', 'admin.service exports getAdminOverview');
    assert(typeof adminService.getAdminUserDetails === 'function', 'admin.service exports getAdminUserDetails');

    const overview = await adminService.getAdminOverview();
    assert(overview && overview.metrics && typeof overview.metrics.totalUsers === 'number', 'Admin overview metrics verified');
    assert(Array.isArray(overview.users), 'Admin overview returns users array');
    assert(Array.isArray(overview.activities), 'Admin overview returns live activity stream');
  } catch (e) {
    assert(false, `Test 13 threw error: ${e.message}`);
  }

  // TEST 14: Cold Email Clean Extraction & Anti-Duplication Engine
  try {
    const { sanitizeAndExtractEmail } = require('./server/src/services/llm.service');
    assert(typeof sanitizeAndExtractEmail === 'function', 'llm.service exports sanitizeAndExtractEmail');

    // Case A: Exact User Screenshot Bug Reproduction
    const buggyRawText = `Hi Hiring Team,

Exploring Full Stack Developer Opportunities at Ship - Santhosh T K

Hi Hiring Team,

I'm excited to explore Full Stack Developer opportunities at Ship, where I can leverage my 3+ years of experience in MERN stack development to drive scalable solutions.

With expertise in building high-performance RESTful APIs, I've delivered measurable impact at Sify Technologies (20% API latency reduction, 30% production bug decrease) and IQVIA (clinical platform development). I'd love to discuss how my skills can contribute to Ship's success.

Let's schedule a brief 10-minute chat this week to explore opportunities further. I've attached my 1-page resume for your review.

Best regards,
Santhosh T K`;

    const candidate = {
      name: 'Santhosh T K',
      title: 'Full Stack Developer',
      phone: '+91 8825802707',
      email: 'tksanthosh494@gmail.com',
      linkedin: 'linkedin.com/in/santhosh-tk',
      github: 'github.com/TKSanthosh'
    };

    const sanitized = sanitizeAndExtractEmail(buggyRawText, 'Hiring Team', 'Ship', candidate);

    assert(sanitized.subject === 'Exploring Full Stack Developer Opportunities at Ship - Santhosh T K', 'Extracted clean subject line from text without prefix');
    assert(!sanitized.body.includes('Exploring Full Stack Developer Opportunities at Ship - Santhosh T K'), 'Subject line is 100% stripped from email body');

    const greetingCount = (sanitized.body.match(/Hi Hiring Team,/g) || []).length;
    assert(greetingCount === 1, `Greeting is strictly deduplicated to 1 occurrence (Actual: ${greetingCount})`);

    const signoffCount = (sanitized.body.match(/Best regards,/g) || []).length;
    assert(signoffCount === 1, `Signoff is strictly deduplicated to 1 occurrence (Actual: ${signoffCount})`);

    // Case B: Explicit "Subject:" Prefix
    const explicitSubjectRaw = `Subject: Application for Software Engineer at Google - Santhosh T K\n\nHi Sundar,\n\nI am thrilled to apply for the Software Engineer role.\n\nBest regards,\nSanthosh T K`;
    const resB = sanitizeAndExtractEmail(explicitSubjectRaw, 'Sundar', 'Google', candidate);
    assert(resB.subject === 'Application for Software Engineer at Google - Santhosh T K', 'Explicit Subject line extracted');
    assert(!resB.body.includes('Subject:'), 'Subject prefix removed from body');
    assert(!resB.body.includes('Application for Software Engineer at Google'), 'Subject text stripped from body');

    // Case C: JSON Response safety net
    const jsonRaw = JSON.stringify({
      subject: 'Software Developer | 3+ Years | React / Node.js / MERN | Interested in Swiggy',
      greeting: 'Hi Swiggy Hiring Team,',
      paragraph1: 'I have 3+ years experience with Node.js and React.',
      paragraph2: 'Let us connect for 10 minutes.'
    });
    const resC = sanitizeAndExtractEmail(jsonRaw, 'Swiggy Hiring Team', 'Swiggy', candidate);
    assert(resC.subject.includes('Interested in Swiggy') && resC.subject.includes('3+ Years'), 'JSON subject extracted cleanly with requested format');
    assert(!resC.body.includes('{') && !resC.body.includes('"greeting"'), 'JSON artifacts 100% stripped from body');

    // Case D: New Template Verification
    const templateRaw = `Subject: Software Developer | 3+ Years | React / Node.js / MERN | Interested in Swiggy

Hi Priya,

I’m Santhosh T K, a Software Developer with 3+ years of experience in React, Node.js, and Express, currently working on high-throughput backend services.

I’m reaching out regarding Software Developer opportunities at Swiggy. Your team’s work in high-scale logistics caught my attention, and I believe my experience could be relevant.

**What I bring:**
• 3+ years of experience with Node.js, React.js, and REST APIs
• Built/owned enterprise clinical data platforms
• Reduced API latency by ~20% and cut defects by ~30%
• Experience with AWS, microservices, and databases

I’d appreciate it if you could take a quick look at my profile and consider me for relevant openings.

**Resume:** Attached (1-Page ATS PDF)
**LinkedIn:** https://linkedin.com/in/santhosh-tk
**GitHub:** https://github.com/TKSanthosh

If there’s a suitable opening, I’d be happy to discuss how I could contribute to the team.

Best regards,
Santhosh T K
+91 8825802707 | tksanthosh494@gmail.com`;

    const resD = sanitizeAndExtractEmail(templateRaw, 'Priya', 'Swiggy', candidate);
    assert(resD.subject === 'Software Developer | 3+ Years | React / Node.js / MERN | Interested in Swiggy', 'Subject matches [Role] | [X Years] | [Key Tech] | Interested in [Company]');
    assert(resD.body.includes('**What I bring:**'), 'Email body contains **What I bring:** section');
    assert(resD.body.includes('**Resume:**') && resD.body.includes('**LinkedIn:**') && resD.body.includes('**GitHub:**'), 'Email body contains Resume, LinkedIn, and GitHub links');
    assert(resD.body.includes('Hi Priya,'), 'Greeting matches recipient recruiter name');

  } catch (e) {
    assert(false, `Test 14 threw error: ${e.message}`);
  }

  // TEST 15: Crypto Vault & Secure Credential Encryption Verification
  try {
    const { encryptText, decryptText, encryptData, decryptData } = require('./server/src/services/crypto.service');
    const secretPass = 'superSecretNaukriPassword123!@#';
    const encrypted = encryptText(secretPass);
    assert(encrypted.startsWith('enc:v1:'), 'Encrypted password starts with versioned prefix enc:v1:');
    const sampleCookies = [{ name: 'nauk_session', value: 'xyz987', domain: '.naukri.com', path: '/' }];
    const encCookies = encryptData(sampleCookies);
    assert(typeof encCookies === 'string' && encCookies.startsWith('enc:v1:'), 'Cookies securely encrypted to ciphertext string');
    const decCookies = decryptData(encCookies);
    assert(Array.isArray(decCookies) && decCookies[0].value === 'xyz987', 'Decrypted cookies array restored accurately');
  } catch (e) {
    assert(false, `Test 15 threw error: ${e.message}`);
  }

  // TEST 16: Multi-Tier Email Deliverability & Verification Engine
  try {
    const { isValidEmailSyntax, getDomainMxRecords, verifyEmailDeliverability, generateAndVerifyRecruiterEmail } = require('./server/src/services/email_verifier.service');
    assert(typeof isValidEmailSyntax === 'function', 'email_verifier.service exports isValidEmailSyntax');
    assert(typeof getDomainMxRecords === 'function', 'email_verifier.service exports getDomainMxRecords');
    assert(typeof verifyEmailDeliverability === 'function', 'email_verifier.service exports verifyEmailDeliverability');
    assert(typeof generateAndVerifyRecruiterEmail === 'function', 'email_verifier.service exports generateAndVerifyRecruiterEmail');

    // Syntax validation tests
    assert(isValidEmailSyntax('careers@swiggy.in') === true, 'Valid syntax: careers@swiggy.in');
    assert(isValidEmailSyntax('invalid-email-address') === false, 'Invalid syntax rejected: invalid-email-address');
    assert(isValidEmailSyntax('@emptyuser.com') === false, 'Invalid syntax rejected: @emptyuser.com');

    // Fake / dummy domain rejection
    const dummyCheck = await verifyEmailDeliverability('fake_recruiter@example.com');
    assert(dummyCheck.isValid === false && dummyCheck.reason.includes('dummy'), 'Dummy domain example.com rejected');

    const tempMailCheck = await verifyEmailDeliverability('temp@mailinator.com');
    assert(tempMailCheck.isValid === false, 'Disposable domain mailinator.com rejected');

    // Real MX verification
    const validCheck = await verifyEmailDeliverability('careers@google.com');
    assert(validCheck.isValid === true && validCheck.mxCount > 0, 'Google.com MX verified deliverable');

    // Recruiter corporate email pattern synthesis
    const patternResult = await generateAndVerifyRecruiterEmail('Priya Sharma', 'Swiggy', 'swiggy.in');
    assert(patternResult && patternResult.email.includes('@swiggy.in'), `Recruiter corporate email synthesized: ${patternResult?.email}`);
  } catch (e) {
    assert(false, `Test 16 threw error: ${e.message}`);
  }

  // TEST 17: Gmail Bounce Detector & Auto-Blacklist Engine
  try {
    const { getBouncedEmails, isEmailBounced, addBouncedEmail, clearBounces, extractBouncedEmailFromMessage } = require('./server/src/services/bounce.service');
    assert(typeof getBouncedEmails === 'function', 'bounce.service exports getBouncedEmails');
    assert(typeof isEmailBounced === 'function', 'bounce.service exports isEmailBounced');
    assert(typeof addBouncedEmail === 'function', 'bounce.service exports addBouncedEmail');

    const testBadEmail = `bounced_unit_test_${Date.now()}@nonexistent-xyz-987.com`;
    assert(isEmailBounced(testBadEmail) === false, 'Fresh email is not yet blacklisted');

    addBouncedEmail('tksanthosh494_gmail_com', testBadEmail, '550 5.1.1 Address not found', 'Test Subject');
    assert(isEmailBounced(testBadEmail, 'tksanthosh494_gmail_com') === true, 'Bounced email is now blacklisted');

    // Test message parsing
    const mockBounceMsg = {
      snippet: 'Delivery to the following recipient failed permanently: fake_dead_hr@company.com',
      payload: { headers: [] }
    };
    const extractedEmail = extractBouncedEmailFromMessage(mockBounceMsg);
    assert(extractedEmail === 'fake_dead_hr@company.com', `Extracted bounced recipient: ${extractedEmail}`);
  } catch (e) {
    assert(false, `Test 17 threw error: ${e.message}`);
  }

  // TEST 18: LinkedIn Job Post Scraper & Recruiter Contact Extraction
  try {
    const { scrapeLinkedInJobPost, parsePastedLinkedInPost } = require('./server/src/services/linkedin.service');
    assert(typeof scrapeLinkedInJobPost === 'function', 'linkedin.service exports scrapeLinkedInJobPost');
    assert(typeof parsePastedLinkedInPost === 'function', 'linkedin.service exports parsePastedLinkedInPost');

    // Test A: User pastes raw hiring post text
    const samplePostText = 'We are hiring Senior Full Stack Developers at Razorpay! Reach out to Arjun Nair at tech-hiring@razorpay.com';
    const parsedLead = await parsePastedLinkedInPost(samplePostText);
    assert(parsedLead && parsedLead.company.toLowerCase().includes('razorpay'), `Parsed company: ${parsedLead.company}`);
    assert(parsedLead.email && parsedLead.email.includes('@'), `Discovered deliverable email: ${parsedLead.email}`);
    assert(parsedLead.isVerified === true, 'Parsed lead is marked verified');

    // Test B: User pastes a LinkedIn Job URL
    const sampleJobUrl = 'https://www.linkedin.com/jobs/view/4158392019/';
    const scrapedJob = await scrapeLinkedInJobPost(sampleJobUrl);
    assert(scrapedJob && scrapedJob.email && scrapedJob.email.includes('@'), `Job URL scraper resolved verified contact: ${scrapedJob.email}`);
    assert(scrapedJob.sourceUrl.includes('linkedin.com/jobs/view/4158392019'), 'Source URL preserved');
  } catch (e) {
    assert(false, `Test 18 threw error: ${e.message}`);
  }

  // TEST 19: Naukri Smart Q&A Memory Store & Fuzzy Question Matching
  try {
    const { getQaDatabase, saveQaItem, deleteQaItem, findBestAnswer, DEFAULT_QA_ITEMS } = require('./server/src/services/naukri_apply.service');
    assert(typeof getQaDatabase === 'function', 'naukri_apply.service exports getQaDatabase');
    assert(typeof saveQaItem === 'function', 'naukri_apply.service exports saveQaItem');
    assert(typeof findBestAnswer === 'function', 'naukri_apply.service exports findBestAnswer');

    const testUser = 'tksanthosh494_gmail_com';
    const qaList = getQaDatabase(testUser);
    assert(Array.isArray(qaList) && qaList.length >= 10, `Loaded ${qaList.length} Q&A items from memory DB`);

    // Test exact question matching
    const match1 = findBestAnswer(testUser, 'How many years of total experience do you have?');
    assert(match1 && match1.answer === '3.5', 'Exact match for total experience returns 3.5');

    // Test fuzzy question matching
    const match2 = findBestAnswer(testUser, 'What is your current CTC compensation in lakhs?');
    assert(match2 && match2.answer === '8', 'Fuzzy match for current CTC returns 8');

    const match3 = findBestAnswer(testUser, 'Please state your official notice period in days');
    assert(match3 && match3.answer === '15', 'Fuzzy match for notice period returns 15');

    // Test saving custom Q&A item
    const customItem = saveQaItem(testUser, {
      question: 'Do you have production experience in Next.js and TypeScript?',
      answer: 'Yes, 3+ Years in production',
      category: 'Skills'
    });
    assert(customItem && customItem.id, 'Custom Q&A item saved successfully');

    const matchCustom = findBestAnswer(testUser, 'Do you have production experience in Next.js and TypeScript?');
    assert(matchCustom && matchCustom.answer.includes('3+ Years'), 'Custom Q&A answer retrieved accurately');
  } catch (e) {
    assert(false, `Test 19 threw error: ${e.message}`);
  }

  // TEST 20: Pending Questions Resolution & Applied Jobs Logger
  try {
    const { getPendingQuestions, addPendingQuestion, resolvePendingQuestion, getNaukriAppliedJobs, logNaukriAppliedJob } = require('./server/src/services/naukri_apply.service');
    const testUser = 'tksanthosh494_gmail_com';

    // Add pending question
    const pendingQ = addPendingQuestion(testUser, {
      jobTitle: 'MERN Lead',
      company: 'Zepto',
      question: 'Are you comfortable working from our HSR Layout Bangalore office 5 days a week?'
    });
    assert(pendingQ && pendingQ.id, 'Pending screening question queued');

    // Resolve pending question
    const resolved = resolvePendingQuestion(testUser, pendingQ.id, 'Yes, 100% comfortable working from Bangalore office');
    assert(resolved.success === true, 'Pending question resolved and saved to permanent DB');

    // Log applied job
    const appLog = logNaukriAppliedJob(testUser, {
      jobTitle: 'SDE-2 Full Stack',
      company: 'Swiggy',
      location: 'Bangalore',
      jobUrl: 'https://www.naukri.com/job-123'
    });
    assert(appLog && appLog.company === 'Swiggy', 'Naukri applied job logged successfully');

    const allApps = getNaukriAppliedJobs(testUser);
    assert(allApps.some(a => a.company === 'Swiggy'), 'Applied job appears in history array');
  } catch (e) {
    assert(false, `Test 20 threw error: ${e.message}`);
  }

  // TEST 21: LinkedIn Infinite Fresh Lead Harvester Fallback
  try {
    const { harvestRecruiterPosts } = require('./server/src/services/linkedin.service');
    const testUser = 'tksanthosh494_gmail_com';

    // Harvest leads with simulated heavy previous outreach
    const leads = await harvestRecruiterPosts('Full Stack Developer MERN', 10, testUser, '3d');
    assert(Array.isArray(leads) && leads.length >= 5, `Infinite lead harvester returns fresh leads (Found: ${leads.length})`);
    assert(leads.every(l => l.email && l.email.includes('@')), 'All returned leads have valid email format');
    assert(leads.every(l => l.company && l.company.length > 0), 'All returned leads have non-empty company');
  } catch (e) {
    assert(false, `Test 21 threw error: ${e.message}`);
  }

  // TEST 22: Naukri Distributed Concurrency Lock Manager
  try {
    const { acquireUserLock, releaseUserLock, isUserLocked } = require('./server/src/services/naukri.service');
    assert(typeof acquireUserLock === 'function', 'naukri.service exports acquireUserLock');
    assert(typeof releaseUserLock === 'function', 'naukri.service exports releaseUserLock');
    assert(typeof isUserLocked === 'function', 'naukri.service exports isUserLocked');

    const testLockUser = 'test_lock_user_123';
    releaseUserLock(testLockUser);
    assert(isUserLocked(testLockUser) === false, 'Fresh user is initially unlocked');

    const acquired1 = acquireUserLock(testLockUser, 'worker_1');
    assert(acquired1 === true, 'First worker successfully acquired lock');
    assert(isUserLocked(testLockUser) === true, 'User is now locked');

    const acquired2 = acquireUserLock(testLockUser, 'worker_2');
    assert(acquired2 === false, 'Concurrent worker was blocked from acquiring lock');

    releaseUserLock(testLockUser);
    assert(isUserLocked(testLockUser) === false, 'Lock was released cleanly');
  } catch (e) {
    assert(false, `Test 22 threw error: ${e.message}`);
  }

  // TEST 23: Company Diversity Interleaving & Anti-Monopolization
  try {
    const { buildDiverseApplicationQueue, ApplicationState } = require('./server/src/services/naukri_apply.service');
    assert(typeof buildDiverseApplicationQueue === 'function', 'naukri_apply.service exports buildDiverseApplicationQueue');

    const sampleDiscovered = [
      { title: 'Full Stack Developer', company: 'Company A', url: 'https://naukri.com/job-a1', jobId: 'job_a1', location: 'Bangalore', exp: '3-5 Yrs' },
      { title: 'Backend Developer', company: 'Company A', url: 'https://naukri.com/job-a2', jobId: 'job_a2', location: 'Bangalore', exp: '3-5 Yrs' },
      { title: 'Frontend Developer', company: 'Company A', url: 'https://naukri.com/job-a3', jobId: 'job_a3', location: 'Bangalore', exp: '3-5 Yrs' },
      { title: 'Full Stack Developer', company: 'Company B', url: 'https://naukri.com/job-b1', jobId: 'job_b1', location: 'Bangalore', exp: '3-5 Yrs' },
      { title: 'Full Stack Developer', company: 'Company C', url: 'https://naukri.com/job-c1', jobId: 'job_c1', location: 'Bangalore', exp: '3-5 Yrs' },
      { title: 'Software Engineer', company: 'Company D', url: 'https://naukri.com/job-d1', jobId: 'job_d1', location: 'Bangalore', exp: '3-5 Yrs' }
    ];

    const filterConfig = {
      maxJobsPerCompanyPerRun: 2,
      minRelevanceScore: 30,
      jobTitles: ['Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'Software Engineer']
    };

    const queue = buildDiverseApplicationQueue(sampleDiscovered, filterConfig, new Set());
    assert(Array.isArray(queue) && queue.length > 0, 'Built application queue');

    // Count per company
    const counts = {};
    queue.forEach(q => {
      counts[q.company] = (counts[q.company] || 0) + 1;
    });

    assert((counts['Company A'] || 0) <= 2, `Company A capped at maxJobsPerCompanyPerRun=2 (Actual: ${counts['Company A']})`);
    assert(queue[0].company !== queue[1].company, 'Consecutive jobs are round-robin interleaved across diverse companies');
    assert(queue.every(q => q.state === ApplicationState.QUEUED), 'All newly queued jobs are in QUEUED state');
  } catch (e) {
    assert(false, `Test 23 threw error: ${e.message}`);
  }

  // TEST 24: Zero-Hallucination Guard & Mandatory Question Pausing
  try {
    const { findBestAnswer, resolveAnswerWithOptionMapping } = require('./server/src/services/naukri_apply.service');

    // Known question -> high confidence
    const knownMatch = findBestAnswer('tksanthosh494_gmail_com', 'What is your total years of work experience?');
    assert(knownMatch && knownMatch.confidence >= 80, 'Known experience question matched with confidence >= 80%');

    // Completely unknown question -> returns null (strict zero hallucination)
    const unknownMatch = findBestAnswer('tksanthosh494_gmail_com', 'What is your security clearance level for government aerospace projects in Germany?');
    assert(unknownMatch === null, 'Unknown screening question returns null without fabricating answers');

    // Option mapping test
    const mapped = resolveAnswerWithOptionMapping('15', { answer: '15' }, 90, ['Immediate / Less than 15 days', '15 to 30 days', 'More than 30 days']);
    assert(mapped && mapped.answer.includes('15'), 'Mapped numeric answer to closest dropdown option');
  } catch (e) {
    assert(false, `Test 24 threw error: ${e.message}`);
  }

  // TEST 25: Application State Machine & Daily Target Stats (Only Verified SUBMITTED Count)
  try {
    const { getTodayAppliedStats, ApplicationState } = require('./server/src/services/naukri_apply.service');
    assert(ApplicationState.QUEUED === 'QUEUED', 'ApplicationState contains QUEUED');
    assert(ApplicationState.WAITING_FOR_USER === 'WAITING_FOR_USER', 'ApplicationState contains WAITING_FOR_USER');
    assert(ApplicationState.READY_TO_SUBMIT === 'READY_TO_SUBMIT', 'ApplicationState contains READY_TO_SUBMIT');
    assert(ApplicationState.SUBMITTED === 'SUBMITTED', 'ApplicationState contains SUBMITTED');

    const stats = getTodayAppliedStats('tksanthosh494_gmail_com');
    assert(typeof stats.todayCount === 'number', 'todayStats returns numeric todayCount');
    assert(typeof stats.remainingTarget === 'number', 'todayStats calculates remaining target');
    assert(typeof stats.percentComplete === 'number', 'todayStats calculates percentComplete');
  } catch (e) {
    assert(false, `Test 25 threw error: ${e.message}`);
  }

  console.log(`\n--- TEST SUITE SUMMARY: ${failedTests === 0 ? 'ALL TESTS PASSED ✅' : `${failedTests} FAILURES ❌`} ---`);
  if (failedTests > 0) process.exit(1);
}

testPdfSinglePage();
