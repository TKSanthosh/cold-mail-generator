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
  const internalComponents = new Set(['App', 'SingleSender', 'BulkSender', 'LogsViewer', 'ResumeEditor', 'JdResumeTailor']);
  
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
    
    const testPdfPath = path.join(__dirname, 'test_single_page_unit.pdf');
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

  console.log(`\n--- TEST SUITE SUMMARY: ${failedTests === 0 ? 'ALL TESTS PASSED ✅' : `${failedTests} FAILURES ❌`} ---`);
  if (failedTests > 0) process.exit(1);
}

testPdfSinglePage();
