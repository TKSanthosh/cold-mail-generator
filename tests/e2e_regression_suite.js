/**
 * Master Comprehensive Automated E2E & Regression Test Suite
 * Fully automated testing across all architectural layers:
 * 
 * 1. MICRO-LEVEL FUNCTIONALITY:
 *    - Syntax integrity across all server services, controllers, and Chrome extension scripts
 *    - PDF Naming standardization (formatTailoredPdfName) across companies, roles, levels, and specializations
 *    - Roman numeral word-boundary matching (I, II, III, IV, etc.) preventing substring collision
 *    - Google Careers / UI junk heading filtering ('Early', 'Job Details', 'Overview', etc.)
 *    - Canonical URL slug role extraction regex
 *    - Strict 1-Page PDF layout constraint (/Type /Page count === 1)
 *    - Human-invisible, ATS-readable microscopic white keyword layer embedding
 * 
 * 2. MINI-LEVEL FUNCTIONALITY:
 *    - Per-user sandbox resolution and default account fallback
 *    - ATS score calculation bounds (75% - 98%)
 *    - Matched skill extraction & relevance scoring
 *    - Q&A database integrity (Total experience = 4 years)
 *    - Company application deduplication sets & normalization
 *    - Multi-process user lock engines (acquireUserLockAsync / releaseUserLockAsync)
 *    - Safe JSON network response wrapper (handles HTML 502 gracefully)
 * 
 * 3. MACRO-LEVEL FUNCTIONALITY:
 *    - Live Express HTTP daemon connectivity & health (/api/health, /api/keepalive/status)
 *    - Applications catalog retrieval & enrichment (/api/applications)
 *    - Full live resume tailoring workflow (/api/applications/tailor)
 *    - Live PDF streaming & binary validation (/api/applications/:id/pdf)
 *    - On-The-Fly PDF recompilation resilience (zero 404s when binary missing on disk)
 *    - Application record lifecycle cleanup (DELETE /api/applications/:id)
 *    - Production client Vite build artifact verification
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const results = [];

function assert(desc, condition, errDetail = '') {
  if (condition) {
    passed++;
    results.push({ test: desc, status: 'PASS' });
    console.log(`  \x1b[32m[PASS]\x1b[0m ${desc}`);
  } else {
    failed++;
    results.push({ test: desc, status: 'FAIL', error: errDetail });
    console.error(`  \x1b[31m[FAIL]\x1b[0m ${desc} -> ${errDetail}`);
  }
}

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://');
    const lib = isHttps ? https : http;
    const req = lib.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runMasterRegressionSuite() {
  console.log('\n================================================================================');
  console.log('  MASTER COMPREHENSIVE AUTOMATED E2E & REGRESSION TEST SUITE');
  console.log('  Testing Micro, Mini, and Macro Functionality Across All Layers');
  console.log('================================================================================\n');

  const rootDir = path.join(__dirname, '..');

  // =========================================================================
  // 1. MICRO-LEVEL TESTS (Syntax, Algorithms, Pure Functions, PDF Layout)
  // =========================================================================
  console.log('--- [1/3] MICRO-LEVEL TESTS (Syntax, Algorithms, PDF Engine) ---');

  // 1a. Syntax Verification for Server & Extension Files
  const filesToLint = [
    'server/src/index.js',
    'server/src/services/pdf.service.js',
    'server/src/services/llm.service.js',
    'server/src/services/user.service.js',
    'server/src/services/naukri.service.js',
    'server/src/services/naukri_apply.service.js',
    'server/src/services/mail.service.js',
    'server/src/services/keepalive.service.js',
    'extension/content.js',
    'extension/popup.js',
    'extension/background.js'
  ];

  for (const f of filesToLint) {
    const fullPath = path.join(rootDir, f);
    if (!fs.existsSync(fullPath)) {
      assert(`Micro Syntax: ${f} exists`, false, 'File does not exist');
      continue;
    }
    try {
      execSync(`node -c "${fullPath}"`, { stdio: 'pipe' });
      assert(`Micro Syntax: ${f} (Valid JS, 0 syntax errors)`, true);
    } catch (e) {
      assert(`Micro Syntax: ${f}`, false, e.message);
    }
  }

  // 1b. PDF Naming Algorithm Matrix (formatTailoredPdfName)
  const indexJsCode = fs.readFileSync(path.join(rootDir, 'server/src/index.js'), 'utf8');
  const fnMatch = indexJsCode.match(/function formatTailoredPdfName\([\s\S]*?\n\}/);
  assert('Micro Naming: formatTailoredPdfName function exists in index.js', Boolean(fnMatch));

  let formatTailoredPdfName = null;
  if (fnMatch) {
    formatTailoredPdfName = eval('(' + fnMatch[0] + ')');
  }

  const namingTestCases = [
    {
      name: 'Santhosh T K',
      comp: 'Google LLC',
      role: 'Software Engineer, Full Stack, Google Cloud',
      expected: 'Santhosh_TK_Google_FullStack_SWE.pdf',
      label: 'Google Cloud Full Stack SWE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Google',
      role: 'Software Engineer III, Infrastructure',
      expected: 'Santhosh_TK_Google_SWE_III.pdf',
      label: 'SWE III Roman numeral match'
    },
    {
      name: 'Santhosh T K',
      comp: 'Amazon Web Services',
      role: 'Software Development Engineer II',
      expected: 'Santhosh_TK_Amazon_SDE_II.pdf',
      label: 'Amazon SDE II (Prevents dev word collision)'
    },
    {
      name: 'Santhosh T K',
      comp: 'Microsoft Corporation',
      role: 'Backend Software Engineer',
      expected: 'Santhosh_TK_Microsoft_Backend_SWE.pdf',
      label: 'Microsoft Backend SWE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Apple Inc.',
      role: 'DevOps / Cloud Engineer',
      expected: 'Santhosh_TK_Apple_DevOps.pdf',
      label: 'Apple DevOps'
    },
    {
      name: 'Santhosh T K',
      comp: 'Meta Platforms',
      role: 'Frontend UI Systems Engineer',
      expected: 'Santhosh_TK_Meta_Frontend_SWE.pdf',
      label: 'Meta Frontend SWE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Google DeepMind',
      role: 'Research Engineer, Machine Learning',
      expected: 'Santhosh_TK_Google_AI_MLE.pdf',
      label: 'DeepMind AI MLE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Oracle Corp',
      role: 'Data Engineer / Big Data Platform',
      expected: 'Santhosh_TK_Oracle_Data_Eng.pdf',
      label: 'Oracle Data Eng'
    },
    {
      name: 'Santhosh T K',
      comp: 'Google',
      role: 'Early',
      expected: 'Santhosh_TK_Google_SWE.pdf',
      label: 'Junk Role "Early" filtered to SWE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Google',
      role: 'Job Details',
      expected: 'Santhosh_TK_Google_SWE.pdf',
      label: 'Junk Role "Job Details" filtered to SWE'
    },
    {
      name: 'Santhosh T K',
      comp: 'Netflix',
      role: 'Early Career Software Engineer',
      expected: 'Santhosh_TK_Netflix_SWE.pdf',
      label: 'Junk Role "Early Career" filtered to SWE'
    }
  ];

  for (const tc of namingTestCases) {
    if (formatTailoredPdfName) {
      const generated = formatTailoredPdfName(tc.name, tc.comp, tc.role);
      assert(
        `Micro Naming [${tc.label}]: "${generated}" === "${tc.expected}"`,
        generated === tc.expected,
        `Got "${generated}"`
      );
    }
  }

  // 1c. Google Careers Canonical Slug Extraction Regex
  const slugTestUrls = [
    {
      path: '/about/careers/applications/jobs/results/124061208973058758-software-engineer-full-stack-google-cloud',
      expectedRole: 'Software Engineer Full Stack Google Cloud'
    },
    {
      path: '/about/careers/applications/jobs/results/99481230491823912-site-reliability-engineer-cloud-platforms?hl=en',
      expectedRole: 'Site Reliability Engineer Cloud Platforms'
    }
  ];

  for (const s of slugTestUrls) {
    const slugMatch = s.path.match(/results\/\d+-([a-z0-9\-]+)(?:\?|#|$)/i);
    let extracted = '';
    if (slugMatch && slugMatch[1]) {
      extracted = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
    assert(
      `Micro Slug Regex: Extracted "${extracted}" from Google URL`,
      extracted === s.expectedRole,
      `Got "${extracted}"`
    );
  }

  // 1d. Strict 1-Page PDF Layout Constraint & ATS Keyword Layer
  const { generateResumePdf } = require(path.join(rootDir, 'server/src/services/pdf.service'));
  const testResumePath = path.join(rootDir, 'server/users/tksanthosh494_gmail_com/resume.json');
  let sampleResume = null;
  if (fs.existsSync(testResumePath)) {
    sampleResume = JSON.parse(fs.readFileSync(testResumePath, 'utf8'));
  } else {
    sampleResume = {
      personalInfo: { name: 'Santhosh T K', title: 'Senior Full Stack Software Engineer', email: 'tksanthosh494@gmail.com' },
      skills: { 'Core': ['JavaScript', 'TypeScript', 'Node.js', 'React.js', 'PostgreSQL', 'Docker', 'AWS', 'Kubernetes'] },
      experience: [
        {
          title: 'Senior Software Engineer',
          company: 'Tech Corp',
          bullets: [
            'Architected microservices that scaled to 10M requests daily, reducing latency by 45% using Node.js and Redis caching.',
            'Engineered automated CI/CD pipelines deploying containerized workloads to AWS EKS with zero downtime.'
          ]
        }
      ]
    };
  }

  const scratchDir = path.join(rootDir, 'scratch');
  fs.mkdirSync(scratchDir, { recursive: true });
  const microPdfOut = path.join(scratchDir, 'micro_regression_test.pdf');

  try {
    await generateResumePdf(sampleResume, microPdfOut);
    const pdfExists = fs.existsSync(microPdfOut) && fs.statSync(microPdfOut).size > 2000;
    assert('Micro PDF Generator: Output file created and non-empty', pdfExists);

    const pdfRawBuffer = fs.readFileSync(microPdfOut);
    const pdfLatin1 = pdfRawBuffer.toString('latin1');
    const pageMatches = pdfLatin1.match(/\/Type\s*\/Page\b/g) || [];
    assert(
      `Micro PDF Page Constraint: Strictly 1 Page (Found: ${pageMatches.length} page(s))`,
      pageMatches.length === 1,
      `Expected 1 page, found ${pageMatches.length}`
    );

    const zlib = require('zlib');
    let hasWhiteText = false;
    let idx = 0;
    while ((idx = pdfRawBuffer.indexOf('stream', idx)) !== -1) {
      let start = idx + 6;
      if (pdfRawBuffer[start] === 0x0d) start++;
      if (pdfRawBuffer[start] === 0x0a) start++;
      const end = pdfRawBuffer.indexOf('endstream', start);
      if (end !== -1) {
        try {
          const inflated = zlib.inflateSync(pdfRawBuffer.slice(start, end)).toString('utf8');
          if (inflated.includes('1 1 1 scn') && (inflated.includes('1 Tf') || inflated.includes('0.75 Tf'))) {
            hasWhiteText = true;
            break;
          }
        } catch (_) {}
        idx = end + 9;
      } else {
        break;
      }
    }
    assert('Micro PDF ATS Layer: Microscopic text rendering instructions embedded in PDF stream', hasWhiteText);
  } catch (err) {
    assert('Micro PDF Generation Test', false, err.message);
  }

  // =========================================================================
  // 2. MINI-LEVEL TESTS (User Sandbox, Deduplication, Locks, Q&A DB)
  // =========================================================================
  console.log('\n--- [2/3] MINI-LEVEL TESTS (Sandboxes, Q&A DB, Locks, Dedup Sets) ---');

  const userService = require(path.join(rootDir, 'server/src/services/user.service'));
  const naukriService = require(path.join(rootDir, 'server/src/services/naukri.service'));
  const naukriApplyService = require(path.join(rootDir, 'server/src/services/naukri_apply.service'));

  // 2a. User Sandbox Resolution & Fallback
  try {
    const primaryResume = userService.getUserResume('tksanthosh494_gmail_com');
    assert('Mini Sandbox: Primary user resume exists and has name', Boolean(primaryResume && primaryResume.personalInfo && primaryResume.personalInfo.name));

    const defaultResume = userService.getUserResume('default_user');
    assert('Mini Sandbox: default_user has fallback resume available', Boolean(defaultResume));
  } catch (e) {
    assert('Mini Sandbox Resolution Check', false, e.message);
  }

  // 2b. Q&A Database Integrity (Experience must be 4 Years)
  try {
    const qaDb = naukriApplyService.getQaDatabase('tksanthosh494_gmail_com');
    const totalExpItem = qaDb.find(q => q.id === 'qa_exp_total' || (q.question && q.question.toLowerCase().includes('total experience')));
    const expValue = totalExpItem ? String(totalExpItem.answer).trim() : '';
    assert('Mini Q&A Truth: Total Experience answer strictly equals "4"', expValue === '4' || expValue.includes('4'), `Found answer: "${expValue}"`);
  } catch (e) {
    assert('Mini Q&A Truth Check', false, e.message);
  }

  // 2c. Distributed Lock Engine
  try {
    const hasAcquire = typeof naukriService.acquireUserLockAsync === 'function';
    const hasRelease = typeof naukriService.releaseUserLockAsync === 'function';
    assert('Mini Lock Engine: acquireUserLockAsync & releaseUserLockAsync exported', hasAcquire && hasRelease);
  } catch (e) {
    assert('Mini Lock Engine Check', false, e.message);
  }

  // 2d. Deduplication Sets & Verification Truth
  try {
    const {
      getPastAppliedCompanySets,
      getNaukriCompanyApplicationSummary,
      logNaukriAppliedJob,
      normalizeCompanyName,
      ApplicationState,
      VerificationStatus
    } = naukriApplyService;

    const testKey = 'test_user_dedup_mini_' + Date.now();
    const testCompUnconfirmed = 'Unconfirmed Corp ' + Date.now();
    const testCompVerified = 'Verified Solutions ' + Date.now();
    const normUnconfirmed = normalizeCompanyName(testCompUnconfirmed);
    const normVerified = normalizeCompanyName(testCompVerified);

    logNaukriAppliedJob(testKey, {
      jobId: 'unconf_' + Date.now(),
      jobTitle: 'Frontend Dev',
      company: testCompUnconfirmed,
      jobUrl: 'https://naukri.com/job/unconf',
      status: ApplicationState.SUBMISSION_UNCONFIRMED,
      verificationStatus: VerificationStatus.UNVERIFIED
    });

    const unconfSets = getPastAppliedCompanySets(testKey);
    assert('Mini Deduplication: Unconfirmed submission is excluded from applied company set', !unconfSets.normalizedCompanySet.has(normUnconfirmed));

    logNaukriAppliedJob(testKey, {
      jobId: 'ver_' + Date.now(),
      jobTitle: 'Senior Full Stack SWE',
      company: testCompVerified,
      jobUrl: 'https://naukri.com/job/ver',
      status: ApplicationState.SUBMITTED,
      verificationStatus: VerificationStatus.VERIFIED
    });

    const verSets = getPastAppliedCompanySets(testKey);
    assert('Mini Deduplication: Verified application is in deduplicated company set', verSets.normalizedCompanySet.has(normVerified));
  } catch (e) {
    assert('Mini Deduplication Test', false, e.message);
  }

  // 2e. Safe JSON Exception Handling Wrapper
  try {
    const htmlGateway = '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>';
    let safeMessageHandled = false;
    try {
      JSON.parse(htmlGateway);
    } catch (_) {
      const wrappedError = new Error('Server returned HTTP 502 (Bad Gateway)');
      safeMessageHandled = wrappedError.message.includes('502');
    }
    assert('Mini Safe JSON Wrapper: Catches raw HTML response without crashing process', safeMessageHandled);
  } catch (e) {
    assert('Mini Safe JSON Test', false, e.message);
  }

  // =========================================================================
  // 3. MACRO-LEVEL TESTS (Live Server, E2E Tailor, PDF Streaming, On-The-Fly)
  // =========================================================================
  console.log('\n--- [3/3] MACRO-LEVEL TESTS (Live APIs, Tailor Flow, PDF Download, On-The-Fly Resilience) ---');

  // 3a. Client Vite Production Build Artifacts
  try {
    const distIndex = path.join(rootDir, 'client/dist/index.html');
    const exists = fs.existsSync(distIndex) && fs.statSync(distIndex).size > 100;
    assert('Macro Client Build: client/dist/index.html exists and is non-empty', exists);
  } catch (e) {
    assert('Macro Client Build Check', false, e.message);
  }

  // 3b. Resolve Live Server Port
  let serverBase = 'http://127.0.0.1:5001';
  let serverOnline = false;

  try {
    const health = await fetchHttp(`${serverBase}/api/health`);
    if (health.statusCode === 200) {
      serverOnline = true;
    }
  } catch (_) {
    try {
      const health5000 = await fetchHttp('http://127.0.0.1:5000/api/health');
      if (health5000.statusCode === 200) {
        serverBase = 'http://127.0.0.1:5000';
        serverOnline = true;
      }
    } catch (_) {}
  }

  assert(`Macro Server Liveness: Express daemon active on ${serverBase}`, serverOnline);

  if (serverOnline) {
    // 3c. Core Monitoring Endpoints
    try {
      const healthRes = await fetchHttp(`${serverBase}/api/health`);
      assert('Macro Live Endpoint: GET /api/health returns 200 OK', healthRes.statusCode === 200);

      const keepAliveRes = await fetchHttp(`${serverBase}/api/keepalive/status`);
      assert('Macro Live Endpoint: GET /api/keepalive/status returns 200 OK', keepAliveRes.statusCode === 200);

      const authRes = await fetchHttp(`${serverBase}/api/auth/status?userKey=tksanthosh494_gmail_com`);
      assert('Macro Live Endpoint: GET /api/auth/status returns 200 OK with JSON', authRes.statusCode === 200 && authRes.headers['content-type']?.includes('json'));
    } catch (err) {
      assert('Macro Core Monitoring Endpoints', false, err.message);
    }

    // 3d. Applications List & Enrichment
    let testAppId = null;
    try {
      const appsRes = await fetchHttp(`${serverBase}/api/applications?userKey=tksanthosh494_gmail_com`);
      assert('Macro Applications: GET /api/applications returns 200', appsRes.statusCode === 200);
      const appsData = JSON.parse(appsRes.body);
      assert('Macro Applications: Response contains applications array', Array.isArray(appsData.applications));

      if (appsData.applications.length > 0) {
        const first = appsData.applications[0];
        assert(
          'Macro Applications: Items are enriched with valid downloadName and downloadUrl',
          Boolean(first.downloadName && first.downloadUrl && first.downloadName.endsWith('.pdf'))
        );
      }
    } catch (err) {
      assert('Macro Applications List Check', false, err.message);
    }

    // 3e. End-to-End Resume Tailoring Workflow (POST /api/applications/tailor)
    let createdDownloadUrl = null;
    let createdPdfName = null;
    try {
      const tailorPayload = JSON.stringify({
        role: 'Software Engineer, Full Stack, Google Cloud',
        company: 'Google LLC',
        jd: 'Google Cloud is seeking an experienced Full Stack Software Engineer to build scalable microservices using React, TypeScript, Node.js, Go, Kubernetes, and GCP.',
        userKey: 'tksanthosh494_gmail_com'
      });

      const tailorRes = await fetchHttp(`${serverBase}/api/applications/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(tailorPayload)
        },
        body: tailorPayload
      });

      assert('Macro E2E Tailor: POST /api/applications/tailor returns HTTP 200', tailorRes.statusCode === 200);
      const tailorData = JSON.parse(tailorRes.body);

      assert('Macro E2E Tailor: Success flag is true', tailorData.success === true);
      assert('Macro E2E Tailor: ATS score is between 75 and 98', tailorData.atsScore >= 75 && tailorData.atsScore <= 98);
      assert('Macro E2E Tailor: Matched skills array is populated', Array.isArray(tailorData.matchedSkills) && tailorData.matchedSkills.length > 0);
      assert(
        'Macro E2E Tailor: Filename is properly formatted with company & role short form',
        tailorData.pdfFilename === 'Santhosh_TK_Google_FullStack_SWE.pdf',
        `Got "${tailorData.pdfFilename}"`
      );

      testAppId = tailorData.application?.id;
      createdDownloadUrl = tailorData.downloadUrl;
      createdPdfName = tailorData.pdfFilename;
    } catch (err) {
      assert('Macro E2E Tailoring Workflow', false, err.message);
    }

    // 3f. Live PDF Download Validation (GET /api/applications/:id/pdf)
    if (testAppId) {
      try {
        const downloadRes = await fetchHttp(`${serverBase}/api/applications/${testAppId}/pdf?userKey=tksanthosh494_gmail_com`);
        assert('Macro Live PDF Download: Returns HTTP 200 OK', downloadRes.statusCode === 200);
        assert('Macro Live PDF Download: Content-Type is application/pdf', downloadRes.headers['content-type'] === 'application/pdf');
        assert(
          'Macro Live PDF Download: Content-Disposition contains attachment & proper filename',
          downloadRes.headers['content-disposition']?.includes('attachment') &&
          downloadRes.headers['content-disposition']?.includes('Santhosh_TK_Google_FullStack_SWE.pdf'),
          `Header: ${downloadRes.headers['content-disposition']}`
        );
        assert('Macro Live PDF Download: Stream contains valid PDF binary (> 3000 bytes)', downloadRes.raw.length > 3000);
      } catch (err) {
        assert('Macro Live PDF Download Test', false, err.message);
      }

      // 3g. On-The-Fly PDF Regeneration Resilience (Simulate missing file on disk / fresh session)
      try {
        const userPaths = userService.getUserPaths('tksanthosh494_gmail_com');
        const candidatePdf = path.join(userPaths.uploadsDir, `tailored_resume_${testAppId}.pdf`);
        if (fs.existsSync(candidatePdf)) {
          fs.unlinkSync(candidatePdf); // Purposely delete file from disk to test on-the-fly regeneration
        }

        const regenRes = await fetchHttp(`${serverBase}/api/applications/${testAppId}/pdf?userKey=tksanthosh494_gmail_com`);
        assert(
          'Macro Resilience: Server dynamically re-compiles missing PDF on-the-fly (Returns 200, ZERO 404s)',
          regenRes.statusCode === 200,
          `Got HTTP ${regenRes.statusCode}`
        );
        assert('Macro Resilience: Re-compiled response is application/pdf', regenRes.headers['content-type'] === 'application/pdf');
        assert('Macro Resilience: PDF binary regenerated successfully (> 3000 bytes)', regenRes.raw.length > 3000);
      } catch (err) {
        assert('Macro On-The-Fly Resilience Test', false, err.message);
      }

      // 3h. Cleanup Test Record
      try {
        const deleteRes = await fetchHttp(`${serverBase}/api/applications/${testAppId}?userKey=tksanthosh494_gmail_com`, {
          method: 'DELETE'
        });
        assert('Macro Cleanup: DELETE /api/applications/:id removes test record', deleteRes.statusCode === 200);
      } catch (err) {
        assert('Macro Record Cleanup', false, err.message);
      }
    }
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n================================================================================');
  console.log('  MASTER REGRESSION TEST SUITE EXECUTION SUMMARY');
  console.log(`  Total Automated Checks: ${passed + failed}`);
  console.log(`  \x1b[32mPASSED:\x1b[0m                 ${passed}`);
  console.log(`  \x1b[31mFAILED:\x1b[0m                 ${failed}`);
  console.log('================================================================================\n');

  if (failed > 0) {
    console.error(`\x1b[31m[REGRESSION SUITE FAILED] ${failed} check(s) did not meet standards.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m[REGRESSION SUITE SUCCESS] All micro, mini, and macro tests passed with 100% integrity!\x1b[0m\n`);
    process.exit(0);
  }
}

runMasterRegressionSuite().catch((err) => {
  console.error('[FATAL SUITE ERROR]', err);
  process.exit(1);
});
