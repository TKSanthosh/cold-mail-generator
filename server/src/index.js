const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { parseHrEmail } = require('./utils/parser');
const { getAuthUrl, handleCallbackCode, isAuthorized, logout } = require('./services/oauth.service');
const { generateColdEmail, tailorResume } = require('./services/llm.service');
const { generateResumePdf } = require('./services/pdf.service');
const { sendGmail, createGmailDraft } = require('./services/mail.service');
const { scrapeCompanyIntel } = require('./services/scraper.service');
const { addScheduledJob, getScheduledJobs, cancelScheduledJob, initScheduler } = require('./services/schedule.service');
const { harvestRecruiterPosts, scrapeLinkedInJobPost, parsePastedLinkedInPost, runLinkedInOutreachJob, getLinkedInConfig, saveLinkedInConfig, initLinkedInScheduler } = require('./services/linkedin.service');
const { verifyEmailDeliverability } = require('./services/email_verifier.service');
const { scanGmailBounces, getBouncedEmails, clearBounces } = require('./services/bounce.service');
const {
  getNaukriConfig,
  getNaukriConfigAsync,
  saveNaukriConfig,
  saveNaukriConfigAsync,
  getNaukriHistory,
  clearNaukriHistory,
  getNaukriSessionCookies,
  saveNaukriSessionCookies,
  saveNaukriSessionCookiesAsync,
  clearNaukriSession,
  clearNaukriSessionAsync,
  uploadResumeToNaukri,
  verifyNaukriOtp,
  startInteractiveGoogleSsoLogin,
  initNaukriScheduler,
  triggerNaukriUploadForActiveUsers,
  validateNaukriSession,
  getNaukriSessionStatus,
  getNaukriSessionStatusAsync,
  checkNaukriPortfolio,
  applyNaukriMicroChanges
} = require('./services/naukri.service');
const { initKeepAliveService, getKeepAliveStatus } = require('./services/keepalive.service');
const { generateTokens, verifyAccessToken, verifyRefreshToken, ONE_MONTH_SECONDS } = require('./services/jwt.service');
const {
  getUserKeyFromEmail,
  getUserPaths,
  ensureUserSandbox,
  getUserProfile,
  getUserResume,
  getUserResumeAsync,
  saveUserResume,
  getUserApplications,
  saveUserApplications,
  syncUserApplications,
  getUserLogs,
  addUserLog,
  syncUserLogs,
  hydrateUserSandboxFromDatabase,
  isUserAuthorized,
  listAllProfiles,
  USERS_DIR,
  createFullBackup,
  restoreFullBackup
} = require('./services/user.service');
const {
  isSupabaseConfigured,
  supabaseGetAllUsers,
  supabaseGetNaukriConfig,
  supabaseGetNaukriHistory,
  supabaseGetScheduledJobs,
  supabaseGetLinkedInConfig
} = require('./services/supabase.service');
const {
  getQaDatabase,
  getQaDatabaseAsync,
  saveQaItem,
  saveQaItemAsync,
  deleteQaItem,
  deleteQaItemAsync,
  getPendingQuestions,
  resolvePendingQuestion,
  resolvePendingQuestionAsync,
  getNaukriAppliedJobs,
  getTodayAppliedStats,
  getFilterConfig,
  saveFilterConfig,
  getNaukriQueue,
  saveNaukriQueue,
  updateQueueItemState,
  clearNaukriQueue,
  runStandaloneNaukriApply,
  reconcileNaukriAppliedJobs,
  getAutoApplyStatus,
  getNaukriCompanyApplicationSummary,
  getNaukriExternalJobs,
  retryAndApplySingleJobInstantAsync,
  applyAllUnconfirmedJobsAsync,
  startNaukriInteractiveApplySessionAsync,
  submitNaukriSessionAnswerAsync,
  getNaukriInteractiveSessionStatus,
  cancelNaukriInteractiveSession,
  getBatchScreeningQuestionsFilePath,
  getBatchScreeningData,
  saveBatchScreeningData,
  getBatchInspectionStatus,
  pauseBatchInspection,
  getBatchApplyStatus,
  pauseBatchApply,
  saveBatchScreeningAnswersAsync,
  inspectBatchJobQuestionsAsync,
  applyBatchWithAnswersAsync
} = require('./services/naukri_apply.service');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
  origin: true, // Reflect request origin for cookies & credentials
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));

// --- SYSTEM SECRETS & DAILY CAPS CONFIGURATION ---
const CRON_SECRET = process.env.CRON_SECRET || 'd829c6fb74cf79387fcbb87c45e65acb4621c32be136680ff85b73782021a721';
const SYSTEM_MUTATION_KEY = process.env.SYSTEM_MUTATION_KEY || 'e2f5a71c338201003ac9a49935eb867397e5d577eaa62adfb98da79568c96cc2';
const MAX_DAILY_NAUKRI = parseInt(process.env.MAX_DAILY_NAUKRI_APPLICATIONS || '40', 10);
const MAX_DAILY_EMAILS = parseInt(process.env.MAX_DAILY_COLD_EMAILS || '25', 10);
const REQUIRE_OUTREACH_APPROVAL = process.env.REQUIRE_OUTREACH_APPROVAL === 'true';

// In-memory daily counter cache: userKey:YYYY-MM-DD -> { naukriCount, emailCount }
const dailyDispatchCounters = new Map();

// In-memory Review Queue storage: userKey -> Array of items
const reviewQueue = new Map();

function getTodayKey(userKey) {
  const today = new Date().toISOString().split('T')[0];
  return `${userKey}:${today}`;
}

function checkAndIncrementDailyCap(userKey, type = 'naukri') {
  const key = getTodayKey(userKey);
  const current = dailyDispatchCounters.get(key) || { naukriCount: 0, emailCount: 0 };
  if (type === 'naukri') {
    if (current.naukriCount >= MAX_DAILY_NAUKRI) {
      return { allowed: false, current: current.naukriCount, max: MAX_DAILY_NAUKRI };
    }
    current.naukriCount++;
  } else {
    if (current.emailCount >= MAX_DAILY_EMAILS) {
      return { allowed: false, current: current.emailCount, max: MAX_DAILY_EMAILS };
    }
    current.emailCount++;
  }
  dailyDispatchCounters.set(key, current);
  return { allowed: true, current: type === 'naukri' ? current.naukriCount : current.emailCount, max: type === 'naukri' ? MAX_DAILY_NAUKRI : MAX_DAILY_EMAILS };
}

function isSystemAuthorized(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const customSecret = req.headers['x-cron-secret'] || req.headers['x-system-key'];

  if (CRON_SECRET && (token === CRON_SECRET || customSecret === CRON_SECRET)) return true;
  if (SYSTEM_MUTATION_KEY && (token === SYSTEM_MUTATION_KEY || customSecret === SYSTEM_MUTATION_KEY)) return true;
  return false;
}

// Health check endpoint for extension and monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'cold-mail-generator', version: '1.0.0', time: Date.now() });
});

// Helper to resolve active user key from JWT Cookie, Authorization Header, or System Secret
function resolveUserContext(req, res = null) {
  // 0. Check system-level secret authorization
  if (isSystemAuthorized(req)) {
    const targetKey = req.headers['x-user-key'] || req.query?.userKey || req.body?.userKey || 'system_worker';
    return { userKey: targetKey, user: { userKey: targetKey, role: 'system' }, isSystem: true };
  }

  // 1. Try JWT from Cookie
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) {
    const decoded = verifyAccessToken(cookieToken);
    if (decoded && decoded.userKey) {
      return { userKey: decoded.userKey, user: decoded, isSystem: false };
    }
  }

  // 2. Try Refresh Token from Cookie if Access Token is expired
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken && res) {
    const refreshDecoded = verifyRefreshToken(refreshToken);
    if (refreshDecoded && refreshDecoded.userKey) {
      const profile = getUserProfile(refreshDecoded.userKey) || { userKey: refreshDecoded.userKey, email: refreshDecoded.email };
      const newTokens = generateTokens(profile);
      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('auth_token', newTokens.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: ONE_MONTH_SECONDS * 1000
      });
      return { userKey: refreshDecoded.userKey, user: profile, isSystem: false };
    }
  }

  // 3. Try Authorization Bearer Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const decoded = verifyAccessToken(token);
    if (decoded && decoded.userKey) {
      return { userKey: decoded.userKey, user: decoded, isSystem: false };
    }
  }

  // 4. Test mode & sandboxing isolation (active ONLY during automated test runs)
  if (process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test' || process.env.USE_TEST_DATABASE === 'true') {
    const headerKey = req.headers['x-user-key'] || req.query?.userKey || req.body?.userKey;
    if (headerKey && typeof headerKey === 'string' && headerKey.trim().length > 0) {
      const cleanKey = headerKey.trim();
      return { userKey: cleanKey, user: { userKey: cleanKey, isTest: true }, isSystem: false };
    }
  }

  // 5. Unauthenticated guest / logged out
  return { userKey: null, user: null, isSystem: false };
}

function resolveUserKey(req, res = null) {
  const ctx = resolveUserContext(req, res);
  return ctx.userKey || null;
}

// Global Authentication Middleware with strict public allowlist
const PUBLIC_ROUTE_ALLOWLIST = [
  '/api/health',
  '/api/keepalive/status',
  '/api/auth/url',
  '/api/auth/callback',
  '/api/auth/status',
  '/api/auth/profiles',
  '/api/notifications/events',
  '/api/applications/tailor'
];

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();

  // Public allowlist endpoints
  if (PUBLIC_ROUTE_ALLOWLIST.includes(req.path)) {
    const ctx = resolveUserContext(req, res);
    req.user = ctx.user;
    req.userKey = ctx.userKey;
    req.isSystem = ctx.isSystem;
    return next();
  }

  const ctx = resolveUserContext(req, res);
  if (!ctx.userKey) {
    return res.status(401).json({
      error: 'Unauthorized: Valid authentication token or system bearer secret required.',
      path: req.path,
      timestamp: new Date().toISOString()
    });
  }

  req.user = ctx.user;
  req.userKey = ctx.userKey;
  req.isSystem = ctx.isSystem;
  next();
});

// Ensure default sandbox for Santhosh
ensureUserSandbox('tksanthosh494_gmail_com', {
  name: 'Santhosh T K',
  email: 'tksanthosh494@gmail.com'
});

// --- AUTH ROUTING (JWT & 30-Day Cookies) ---
app.get('/api/auth/url', (req, res) => {
  try {

    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/auth/callback`;
    const url = getAuthUrl(req.query.state || '', redirectUri);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/?auth=error&msg=' + encodeURIComponent('Missing authorization code from Google.'));
  }
  try {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const redirectUri = `${protocol}://${host}/api/auth/callback`;

    const userInfo = await handleCallbackCode(code, redirectUri);
    
    // Auto-hydrate entire user sandbox from Supabase cloud database
    if (isSupabaseConfigured()) {
      await hydrateUserSandboxFromDatabase(userInfo.userKey);
    }

    // Generate 30-Day JWT Tokens
    const { accessToken, refreshToken } = generateTokens(userInfo);
    const isProd = process.env.NODE_ENV === 'production';

    // Set 30-Day HttpOnly Cookies
    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: ONE_MONTH_SECONDS * 1000
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: ONE_MONTH_SECONDS * 2 * 1000 // 60 days
    });

    res.cookie('user_session', JSON.stringify({
      userKey: userInfo.userKey,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture
    }), {
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: ONE_MONTH_SECONDS * 1000
    });

    // Redirect to frontend with auth payload
    const redirectUrl = `/?auth=success&jwt=${encodeURIComponent(accessToken)}&userKey=${encodeURIComponent(userInfo.userKey)}&email=${encodeURIComponent(userInfo.email)}&name=${encodeURIComponent(userInfo.name)}&picture=${encodeURIComponent(userInfo.picture || '')}`;
    res.redirect(redirectUrl);
  } catch (e) {
    console.error('OAuth callback exchange error:', e.message);
    const { userKey } = resolveUserContext(req, res);
    if (isUserAuthorized(userKey)) {
      return res.redirect(`/?auth=success&userKey=${encodeURIComponent(userKey)}`);
    }
    res.redirect(`/?auth=error&msg=${encodeURIComponent('Authentication session expired or code was already used. Please click Connect Gmail to sign in.')}`);
  }
});

app.get('/api/auth/status', async (req, res) => {
  const { userKey, user } = resolveUserContext(req, res);
  if (!userKey) {
    return res.json({ authorized: false, user: null, userKey: null });
  }
  // Ensure sandbox is fresh from DB for multi-device sync
  if (isSupabaseConfigured()) {
    await hydrateUserSandboxFromDatabase(userKey);
  }
  const authorized = isUserAuthorized(userKey);
  const profile = getUserProfile(userKey) || user;
  res.json({ authorized, user: profile, userKey });
});

app.get('/api/auth/profiles', (req, res) => {
  try {
    res.json({ profiles: listAllProfiles() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    logout(userKey);
    res.clearCookie('auth_token');
    res.clearCookie('refresh_token');
    res.clearCookie('user_session');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- RESUME TEMPLATE ROUTING (Per-User Sandbox) ---
app.get('/api/resume', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const resumeData = await getUserResumeAsync(userKey);
    res.json(resumeData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/resume', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    saveUserResume(userKey, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload and parse uploaded PDF resume via python script
app.post('/api/resume/upload', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { fileBase64, filename } = req.body;
  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64 is required' });
  }

  try {
    const userPaths = getUserPaths(userKey);
    const tempPdfPath = path.join(userPaths.uploadsDir, `uploaded_resume_${Date.now()}.pdf`);
    const buffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(tempPdfPath, buffer);

    const scriptPath = path.join(__dirname, 'utils/resume_extractor.py');
    const pythonExe = process.platform === 'win32' 
      ? `& "${path.join(__dirname, '../../../python-portable/python.exe')}"`
      : 'python3';

    exec(`${pythonExe} "${scriptPath}" "${tempPdfPath}"`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (e) {}

      if (error) {
        console.error('Python resume extraction error:', stderr || error.message);
        return res.status(500).json({ error: 'Failed to extract text from PDF: ' + (stderr || error.message) });
      }

      try {
        const parsedResume = JSON.parse(stdout.trim());
        saveUserResume(userKey, parsedResume);
        res.json({ success: true, resume: parsedResume });
      } catch (parseErr) {
        console.error('Failed to parse Python JSON output:', stdout);
        res.status(500).json({ error: 'Failed to parse structured resume data' });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- SINGLE EMAIL GENERATION & PREVIEW ---
app.post('/api/generate', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const rawEmail = req.body.hrEmail || req.body.email;
  const { hrName, name, company, jd } = req.body;

  if (!rawEmail) {
    return res.status(400).json({ error: 'HR Email is required' });
  }

  try {
    const parsed = parseHrEmail(rawEmail);
    const finalHrName = hrName || name || parsed.name;
    const finalCompany = company || parsed.company;
    const targetDomain = parsed.domain;

    const standardResume = getUserResume(userKey);

    // Parallel Concurrency: Run Scraping, Resume Tailoring, and Cold Email Generation in parallel
    const [companyIntel, tailoredResumeData, emailData] = await Promise.all([
      scrapeCompanyIntel(finalCompany, targetDomain).catch(() => null),
      tailorResume(standardResume, jd).catch(() => standardResume),
      generateColdEmail(finalHrName, finalCompany, jd, standardResume, null)
    ]);

    res.json({
      hrName: finalHrName,
      name: finalHrName,
      company: finalCompany,
      companyIntel,
      subject: emailData.subject,
      body: emailData.body,
      email: {
        subject: emailData.subject,
        body: emailData.body
      },
      tailoredResume: tailoredResumeData,
      resume: tailoredResumeData
    });
  } catch (e) {
    console.error('Cold email generation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- SEND EMAIL (Per-User Sandbox) ---
app.post('/api/send', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Unauthorized: Valid user session required.' });
  }

  const { email, subject, body, resume, hrName, company, resumeType, skipReview } = req.body;
  if (!email || !subject || !body) {
    return res.status(400).json({ error: 'Missing required parameters: email, subject, body' });
  }

  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Your Gmail account is not connected. Please connect Gmail in settings or app.' });
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail === 'tksanthosh494@gmail.com' || (userKey && cleanEmail === userKey.replace(/_/g, '@'))) {
    return res.status(400).json({ error: `Self-Email Blocked: You cannot send cold outreach emails to your own email address (${email}). Please specify a recruiter's email.` });
  }

  // Check Review Queue Mode (if active and not explicitly skipped)
  if (REQUIRE_OUTREACH_APPROVAL && !skipReview) {
    const reviewItem = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'email',
      createdAt: new Date().toISOString(),
      userKey,
      payload: { email, subject, body, resume, hrName, company, resumeType },
      status: 'PENDING_REVIEW'
    };
    if (!reviewQueue.has(userKey)) reviewQueue.set(userKey, []);
    reviewQueue.get(userKey).push(reviewItem);
    return res.json({
      success: true,
      inReviewQueue: true,
      message: 'Cold email added to Review Queue awaiting approval.',
      reviewItem
    });
  }

  // Enforce Hard Daily Cap in Production
  const capCheck = checkAndIncrementDailyCap(userKey, 'email');
  if (!capCheck.allowed) {
    return res.status(429).json({
      error: `Daily cold email limit (${capCheck.max}) reached. Pausing until 00:00 UTC for safety.`,
      current: capCheck.current,
      max: capCheck.max
    });
  }

  try {
    let cleanBody = body;
    if (typeof cleanBody === 'string' && (cleanBody.trim().startsWith('{') || cleanBody.includes('"body":'))) {
      cleanBody = cleanBody
        .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
        .replace(/"?\s*\}\s*$/, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .trim();
    }

    let targetResume = resume;
    if (!targetResume || !targetResume.personalInfo) {
      targetResume = getUserResume(userKey);
    }

    const userPaths = getUserPaths(userKey);
    const candidateName = targetResume?.personalInfo?.name || 'Resume';
    const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_${Date.now()}.pdf`);

    await generateResumePdf(targetResume, tempPdfPath);
    const result = await sendGmail(email, subject, cleanBody, tempPdfPath, userKey);

    try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (e) {}

    addUserLog(userKey, {
      type: 'Single Email',
      email,
      hrEmail: email,
      hrName: hrName || 'HR',
      company: company || 'Company',
      subject,
      body: cleanBody,
      status: 'Sent',
      resumeType: resumeType || 'Standard',
      messageId: result.id
    });

    res.json({ success: true, message: 'Email sent successfully with tailored PDF attached!', result });
  } catch (e) {
    console.error('Send mail error:', e);
    addUserLog(userKey, {
      type: 'Single Email',
      email,
      hrEmail: email,
      hrName: hrName || 'HR',
      company: company || 'Company',
      subject,
      body,
      status: 'Failed: ' + e.message,
      resumeType: resumeType || 'Standard'
    });
    res.status(500).json({ error: e.message });
  }
});

// --- SAVE GMAIL DRAFT (Per-User Sandbox) ---
app.post('/api/draft', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Unauthorized: Valid user session required.' });
  }

  const { email, subject, body, resume, hrName, company, resumeType } = req.body;
  if (!email || !subject || !body) {
    return res.status(400).json({ error: 'Missing required parameters: email, subject, body' });
  }

  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Your Gmail account is not connected.' });
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail === 'tksanthosh494@gmail.com' || (userKey && cleanEmail === userKey.replace(/_/g, '@'))) {
    return res.status(400).json({ error: `Self-Email Blocked: You cannot create drafts addressed to your own email (${email}).` });
  }

  try {
    let cleanBody = body;
    if (typeof cleanBody === 'string' && (cleanBody.trim().startsWith('{') || cleanBody.includes('"body":'))) {
      cleanBody = cleanBody
        .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
        .replace(/"?\s*\}\s*$/, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .trim();
    }

    let targetResume = resume;
    if (!targetResume || !targetResume.personalInfo) {
      targetResume = getUserResume(userKey);
    }

    const userPaths = getUserPaths(userKey);
    const candidateName = targetResume?.personalInfo?.name || 'Resume';
    const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_Draft_${Date.now()}.pdf`);

    await generateResumePdf(targetResume, tempPdfPath);
    const result = await createGmailDraft(email, subject, cleanBody, tempPdfPath, userKey);

    try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (e) {}

    addUserLog(userKey, {
      type: 'Draft Created in Gmail App',
      email,
      hrEmail: email,
      hrName: hrName || 'HR',
      company: company || 'Company',
      subject,
      body: cleanBody,
      status: 'Draft Saved (Ready in Gmail App)',
      resumeType: resumeType || 'Standard',
      draftId: result.id
    });

    res.json({ success: true, message: 'Draft saved in Gmail with tailored PDF attached!', result });
  } catch (e) {
    console.error('Create draft error:', e);
    res.status(500).json({ error: e.message });
  }
});


// --- SCHEDULE DISPATCH ENDPOINTS ---
app.post('/api/schedule', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { email, subject, body, resume, hrName, company, scheduledAt, resumeType } = req.body;
  if (!email || !subject || !body || !resume || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required scheduling parameters' });
  }

  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Gmail account is not connected.' });
  }

  const cleanSchedEmail = (email || '').trim().toLowerCase();
  if (cleanSchedEmail === 'tksanthosh494@gmail.com' || (userKey && cleanSchedEmail === userKey.replace(/_/g, '@'))) {
    return res.status(400).json({ error: `Self-Email Blocked: You cannot schedule cold emails to your own email (${email}).` });
  }

  let cleanBody = body;
  if (typeof cleanBody === 'string' && (cleanBody.trim().startsWith('{') || cleanBody.includes('"body":'))) {
    cleanBody = cleanBody
      .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
      .replace(/"?\s*\}\s*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  }

  const job = addScheduledJob({
    userKey,
    email,
    subject,
    body: cleanBody,
    resume,
    hrName,
    company,
    scheduledAt,
    resumeType
  });

  res.json({ success: true, job });
});

app.get('/api/scheduled', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const allJobs = getScheduledJobs();
  const userJobs = allJobs.filter(j => !j.userKey || j.userKey === userKey);
  res.json({ jobs: userJobs });
});

app.delete('/api/scheduled/:id', (req, res) => {
  cancelScheduledJob(req.params.id);
  res.json({ success: true });
});

// --- OUTREACH LOGS ENDPOINTS (Per-User Sandbox) ---
app.get('/api/logs', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    res.json({ logs: getUserLogs(userKey) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/logs/download', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const userPaths = getUserPaths(userKey);
    if (fs.existsSync(userPaths.logsPathGz)) {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="outreach_logs_${userKey}.json.gz"`);
      return res.sendFile(userPaths.logsPathGz);
    }
    const logs = getUserLogs(userKey);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="outreach_logs_${userKey}.json"`);
    res.send(JSON.stringify(logs, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/logs/sync', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const clientLogs = req.body?.logs || [];
  try {
    const mergedLogs = syncUserLogs(userKey, clientLogs);
    res.json({ logs: mergedLogs, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/logs', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const userPaths = getUserPaths(userKey);
    writeCompressedJson(userPaths.logsPathGz, userPaths.logsPath, []);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- LINKEDIN RECRUITER AUTO-PILOT ENDPOINTS ---
app.get('/api/linkedin/config', (req, res) => {
  res.json({ config: getLinkedInConfig() });
});

app.post('/api/linkedin/config', (req, res) => {
  const current = getLinkedInConfig();
  const updated = { ...current, ...req.body };
  saveLinkedInConfig(updated);
  res.json({ success: true, config: updated });
});

app.post('/api/linkedin/harvest', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { query, count, timeFrame } = req.body;
  try {
    const leads = await harvestRecruiterPosts(query, count || 10, userKey, timeFrame);
    const pastLogs = getUserLogs(userKey);
    const contactedEmails = new Set(
      pastLogs.map(l => (l.hrEmail || l.email || '').toLowerCase().trim()).filter(Boolean)
    );

    // Annotate leads with alreadyContacted flag
    const annotated = leads.map(l => ({
      ...l,
      alreadyContacted: contactedEmails.has(l.email.toLowerCase())
    }));

    res.json({ success: true, leads: annotated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/linkedin/run', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { query, targetCount, mode } = req.body;
  try {
    const report = await runLinkedInOutreachJob(userKey, {
      query,
      targetCount: targetCount || 10,
      mode: mode || 'send'
    });
    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/linkedin/parse-post', async (req, res) => {
  const { text } = req.body;
  const userKey = resolveUserKey(req, res);
  try {
    const lead = await parsePastedLinkedInPost(text, userKey);
    const pastLogs = getUserLogs(userKey);
    const contactedEmails = new Set(
      pastLogs.map(l => (l.hrEmail || l.email || '').toLowerCase().trim()).filter(Boolean)
    );
    lead.alreadyContacted = contactedEmails.has(lead.email.toLowerCase());
    res.json({ success: true, lead });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/linkedin/scrape-job', async (req, res) => {
  const { url } = req.body;
  const userKey = resolveUserKey(req, res);
  try {
    const lead = await scrapeLinkedInJobPost(url, userKey);
    const pastLogs = getUserLogs(userKey);
    const contactedEmails = new Set(
      pastLogs.map(l => (l.hrEmail || l.email || '').toLowerCase().trim()).filter(Boolean)
    );
    lead.alreadyContacted = contactedEmails.has(lead.email.toLowerCase());
    res.json({ success: true, lead });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- EMAIL DELIVERABILITY & BOUNCE DETECTOR ENDPOINTS ---
app.post('/api/mail/bounces/scan', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Gmail account not connected. Please connect Gmail first.' });
  }
  try {
    const result = await scanGmailBounces(userKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mail/bounces', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const bounces = getBouncedEmails(userKey);
    res.json({ success: true, bounces, totalCount: bounces.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/mail/bounces', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    clearBounces(userKey);
    res.json({ success: true, message: 'Bounce blacklist cleared' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mail/verify-email', async (req, res) => {
  const { email } = req.body;
  const userKey = resolveUserKey(req, res);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const result = await verifyEmailDeliverability(email, userKey);
    res.json({ success: true, verification: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- BULK PREVIEW ENDPOINT ---
app.post('/api/bulk-parse', (req, res) => {
  const { emails } = req.body;
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Emails array is required' });
  }

  const parsed = emails.map(email => {
    const { name, company } = parseHrEmail(email);
    return { email, name, company };
  });

  res.json({ parsed });
});

function formatTailoredPdfName(candidateName, rawCompany, rawRole) {
  let candidate = (candidateName || 'Santhosh_TK')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_');
  if (candidate === 'Santhosh_T_K') candidate = 'Santhosh_TK';

  // Clean company name
  let comp = (rawCompany || 'Company')
    .trim()
    .replace(/^(the|inc|corp|corporation|llc|ltd|pvt|technologies|solutions)\s+/i, '')
    .replace(/[\,\|\-].*$/, '')
    .replace(/\s+(inc|corp|corporation|llc|ltd|pvt|technologies|solutions|india|usa)\.?$/i, '')
    .trim();

  const compUpper = comp.toUpperCase();
  if (compUpper.includes('GOOGLE')) comp = 'Google';
  else if (compUpper.includes('AMAZON') || compUpper.includes('AWS')) comp = 'Amazon';
  else if (compUpper.includes('MICROSOFT')) comp = 'Microsoft';
  else if (compUpper.includes('META') || compUpper.includes('FACEBOOK')) comp = 'Meta';
  else if (compUpper.includes('APPLE')) comp = 'Apple';
  else if (compUpper.includes('NETFLIX')) comp = 'Netflix';
  else if (compUpper.includes('SIFY')) comp = 'Sify';
  else if (compUpper.includes('IQVIA')) comp = 'IQVIA';
  else if (compUpper.includes('LINKEDIN')) comp = 'LinkedIn';
  else if (compUpper.includes('ORACLE')) comp = 'Oracle';
  else {
    comp = comp.split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }
  comp = comp.replace(/[^a-zA-Z0-9]/g, '') || 'Company';

  // Clean and map role name
  const roleStr = (rawRole || 'SWE').trim();
  const rLower = roleStr.toLowerCase();

  // Junk role blacklist (e.g. Google Careers UI artifacts)
  const junkRoles = [
    'job details', 'job detail', 'details', 'early', 'early career', 'mid', 'advanced',
    'intern', 'internship', 'apply', 'career', 'careers', 'search', 'overview',
    'responsibilities', 'qualifications', 'heading'
  ];
  const isJunk = junkRoles.includes(rLower) || junkRoles.some(j => rLower === j || rLower === `${j} career`);

  let shortRole = 'SWE';

  if (!isJunk) {
    if (rLower.includes('full stack') || rLower.includes('fullstack')) {
      shortRole = 'FullStack_SWE';
    } else if (rLower.includes('backend')) {
      shortRole = 'Backend_SWE';
    } else if (rLower.includes('frontend') || rLower.includes('ui developer') || rLower.includes('web developer')) {
      shortRole = 'Frontend_SWE';
    } else if (rLower.includes('machine learning') || rLower.includes('ml ') || rLower.endsWith(' ml') || rLower.includes('ai ') || rLower.includes('deep learning')) {
      shortRole = 'AI_MLE';
    } else if (rLower.includes('data engineer') || rLower.includes('data platform')) {
      shortRole = 'Data_Eng';
    } else if (rLower.includes('devops') || rLower.includes('sre') || rLower.includes('site reliability')) {
      shortRole = 'DevOps';
    } else if (rLower.includes('cloud')) {
      shortRole = 'Cloud_SWE';
    } else if (rLower.includes('security')) {
      shortRole = 'Security_Eng';
    } else if (rLower.includes('system') || rLower.includes('architect')) {
      shortRole = 'SysArch';
    } else if (rLower.includes('software development engineer') || rLower.includes('sde')) {
      const numMatch = roleStr.match(/\b(viii|vii|iii|vi|iv|ix|ii|v|i|[1-9])\b/i);
      shortRole = numMatch ? `SDE_${numMatch[1].toUpperCase()}` : 'SDE';
    } else if (rLower.includes('software engineer') || rLower.includes('swe')) {
      const numMatch = roleStr.match(/\b(viii|vii|iii|vi|iv|ix|ii|v|i|[1-9])\b/i);
      shortRole = numMatch ? `SWE_${numMatch[1].toUpperCase()}` : 'SWE';
    } else {
      shortRole = roleStr
        .replace(/[,|-].*$/, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('_')
        .replace(/[^a-zA-Z0-9_]/g, '');
    }
  }

  if (!shortRole || junkRoles.includes(shortRole.toLowerCase())) {
    shortRole = 'SWE';
  }

  return `${candidate}_${comp}_${shortRole}.pdf`;
}

// --- DEDICATED JD RESUME TAILOR & APPLICATION LOGS ENDPOINTS (Per-User Sandbox) ---
app.post('/api/applications/tailor', async (req, res) => {
  let userKey = resolveUserKey(req, res);
  const explicitKey = req.headers['x-user-key'] || req.body?.userKey || req.query?.userKey;
  if ((!userKey || userKey === 'guest_user') && explicitKey) {
    userKey = explicitKey;
  }

  const { role, company, jd } = req.body;
  if (!jd || jd.trim().length === 0) {
    return res.status(400).json({ error: 'Job description (JD) is required.' });
  }

  try {
    let standardResume = getUserResume(userKey);
    if (!standardResume || !standardResume.personalInfo || !standardResume.personalInfo.name) {
      standardResume = getUserResume('default_user');
    }

    const tailoredResume = await tailorResume(standardResume, jd);

    if (role && role.trim().length > 0) {
      tailoredResume.personalInfo = tailoredResume.personalInfo || {};
      tailoredResume.personalInfo.title = role.trim();
    }

    const displayRole = role ? role.trim() : (tailoredResume.personalInfo?.title || 'Software Development Engineer');
    const displayCompany = company ? company.trim() : 'Company';
    const candidateName = tailoredResume.personalInfo?.name || standardResume?.personalInfo?.name || 'Candidate';
    const cleanPdfFilename = formatTailoredPdfName(candidateName, displayCompany, displayRole);

    const userPaths = getUserPaths(userKey);
    const appId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const pdfFilename = `tailored_resume_${appId}.pdf`;
    const pdfPath = path.join(userPaths.uploadsDir, pdfFilename);

    await generateResumePdf(tailoredResume, pdfPath);

    // Calculate matched skills & ATS score
    const allSkills = Object.values(tailoredResume.skills || {}).flat();
    const jdLower = jd.toLowerCase();
    const matchedSkills = allSkills.filter(s => jdLower.includes(String(s).toLowerCase())).slice(0, 12);
    if (matchedSkills.length === 0 && allSkills.length > 0) {
      matchedSkills.push(...allSkills.slice(0, 6));
    }
    
    // ATS match calculation (base 82% + bonus for keyword density, capped at 98%)
    const skillRatio = allSkills.length > 0 ? (matchedSkills.length / Math.min(allSkills.length, 10)) : 0.8;
    const atsScore = Math.min(98, Math.max(78, Math.round(75 + (skillRatio * 20) + Math.min(jd.length / 500, 3))));

    const newApplication = {
      id: appId,
      role: displayRole,
      company: displayCompany,
      jd,
      tailoredResume,
      appliedAt: new Date().toISOString(),
      timestamp: Date.now(),
      atsScore,
      matchedSkills,
      pdfFilename,
      downloadName: cleanPdfFilename
    };

    const apps = getUserApplications(userKey);
    apps.unshift(newApplication);
    saveUserApplications(userKey, apps);

    res.json({
      success: true,
      application: newApplication,
      atsScore,
      matchedSkills,
      downloadUrl: `/api/applications/${appId}/pdf?userKey=${encodeURIComponent(userKey)}`,
      pdfFilename: cleanPdfFilename,
      userKey
    });
  } catch (e) {
    console.error('Failed to tailor resume for JD:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications', (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Unauthorized: Valid user session required.' });
  }
  try {
    const apps = getUserApplications(userKey) || [];
    const enriched = apps.map(a => {
      const candidateName = a.tailoredResume?.personalInfo?.name || 'Candidate';
      const cleanDownloadName = formatTailoredPdfName(candidateName, a.company, a.role);
      const cleanDownloadUrl = `/api/applications/${a.id}/pdf?userKey=${encodeURIComponent(userKey)}`;
      return {
        ...a,
        downloadName: cleanDownloadName,
        downloadUrl: cleanDownloadUrl
      };
    });
    res.json({ applications: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/applications/sync', (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Unauthorized: Valid user session required.' });
  }
  const clientApps = req.body?.applications || [];
  try {
    const mergedApps = syncUserApplications(userKey, clientApps);
    res.json({ applications: mergedApps, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications/:id/pdf', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Unauthorized: Valid user session required.' });
  }

  const { id } = req.params;
  const apps = getUserApplications(userKey) || [];
  const appItem = apps.find(a => a.id === id);

  if (!appItem) {
    return res.status(404).json({ error: 'Application record not found in user sandbox' });
  }

  const userPaths = getUserPaths(userKey);
  if (!appItem.pdfFilename) {
    appItem.pdfFilename = `tailored_resume_${appItem.id}.pdf`;
  }
  const pdfPath = path.join(userPaths.uploadsDir, appItem.pdfFilename);

  // If PDF file is missing on disk, compile it on-the-fly!
  if (!fs.existsSync(pdfPath)) {
    if (appItem.tailoredResume) {
      try {
        fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
        await generateResumePdf(appItem.tailoredResume, pdfPath);
      } catch (err) {
        console.error('Failed to generate PDF on-the-fly:', err);
        return res.status(500).json({ error: 'Failed to generate PDF file on server' });
      }
    } else {
      return res.status(404).json({ error: 'Resume data not found to generate PDF' });
    }
  }

  const candidateName = appItem.tailoredResume?.personalInfo?.name || 'Candidate';
  const downloadName = formatTailoredPdfName(candidateName, appItem.company, appItem.role);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.sendFile(path.resolve(pdfPath));
});

app.delete('/api/applications/:id', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { id } = req.params;
  let apps = getUserApplications(userKey);
  const appItem = apps.find(a => a.id === id);

  if (appItem && appItem.pdfFilename) {
    const userPaths = getUserPaths(userKey);
    const pdfPath = path.join(userPaths.uploadsDir, appItem.pdfFilename);
    if (fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
  }

  apps = apps.filter(a => a.id !== id);
  saveUserApplications(userKey, apps);

  res.json({ success: true });
});

// --- COMPRESSED PERSISTENT STORAGE & BACKUP ENDPOINTS ---
app.get('/api/backup/export', (req, res) => {
  try {
    const backup = createFullBackup(USERS_DIR);
    res.json(backup);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/backup/restore', (req, res) => {
  try {
    const backupData = req.body;
    const ok = restoreFullBackup(USERS_DIR, backupData);
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- SUPABASE CLOUD STATUS ENDPOINT ---
app.get('/api/supabase/status', (req, res) => {
  res.json({
    configured: isSupabaseConfigured(),
    url: process.env.SUPABASE_URL || null,
    provider: 'Supabase PostgreSQL (Free Tier)'
  });
});

// --- NAUKRI PROFILE BOOSTER & AUTO-UPLOADER ENDPOINTS ---
app.get('/api/naukri/config', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  if (isSupabaseConfigured()) {
    try {
      await hydrateUserSandboxFromDatabase(userKey);
    } catch (e) {}
  }
  const config = await getNaukriConfigAsync(userKey);
  res.json({ config: maskSensitiveConfig(config) });
});

app.post('/api/naukri/config', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const updated = await saveNaukriConfigAsync(userKey, req.body || {});
  res.json({ success: true, config: maskSensitiveConfig(updated) });
});

app.get('/api/naukri/history', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({ history: getNaukriHistory(userKey) });
});

app.delete('/api/naukri/history', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    clearNaukriHistory(userKey);
    res.json({ success: true, history: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/naukri/launch-sso', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = await startInteractiveGoogleSsoLogin(userKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/naukri/trigger', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = await uploadResumeToNaukri(userKey, req.body || {});
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dedicated 24/7 Cloud Cron Trigger endpoint (requires CRON_SECRET or SYSTEM_MUTATION_KEY)
app.all('/api/naukri/cron-trigger', async (req, res) => {
  if (!isSystemAuthorized(req)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: /api/naukri/cron-trigger requires a valid CRON_SECRET or SYSTEM_MUTATION_KEY bearer token.',
      timestamp: new Date().toISOString()
    });
  }

  const force = req.query.force === 'true' || req.body?.force === true;
  const targetUserKey = req.query.userKey || req.body?.userKey || req.headers['x-user-key'] || null;

  try {
    const results = await triggerNaukriUploadForActiveUsers({
      force,
      targetUserKey
    });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      force,
      results
    });
  } catch (e) {
    console.error('[NAUKRI CRON TRIGGER ROUTE ERROR]', e.message);
    broadcastErrorAlert('Naukri Cron Trigger Error', e.message, e.stack, targetUserKey || 'system').catch(() => {});
    res.status(500).json({
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// --- REVIEW QUEUE ENDPOINTS (HUMAN-IN-THE-LOOP SAFETY) ---
app.get('/api/outreach/review', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const items = reviewQueue.get(userKey) || [];
  res.json({ reviewItems: items, count: items.length });
});

app.post('/api/outreach/review/:id/approve', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { id } = req.params;
  const items = reviewQueue.get(userKey) || [];
  const target = items.find(i => i.id === id);
  if (!target) return res.status(404).json({ error: 'Review item not found.' });

  try {
    if (target.type === 'email') {
      const { email, subject, body, resume, hrName, company, resumeType } = target.payload;
      const userPaths = getUserPaths(userKey);
      const candidateName = resume?.personalInfo?.name || 'Resume';
      const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_${Date.now()}.pdf`);
      await generateResumePdf(resume || getUserResume(userKey), tempPdfPath);
      const result = await sendGmail(email, subject, body, tempPdfPath, userKey);
      try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (e) {}

      addUserLog(userKey, {
        type: 'Single Email',
        email,
        hrEmail: email,
        hrName: hrName || 'HR',
        company: company || 'Company',
        subject,
        body,
        status: 'Sent (Approved from Review Queue)',
        resumeType: resumeType || 'Standard',
        messageId: result.id
      });
    }

    reviewQueue.set(userKey, items.filter(i => i.id !== id));
    res.json({ success: true, message: 'Item approved and processed successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/outreach/review/:id/reject', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { id } = req.params;
  const items = reviewQueue.get(userKey) || [];
  reviewQueue.set(userKey, items.filter(i => i.id !== id));
  res.json({ success: true, message: 'Item rejected and removed from review queue.' });
});

app.post('/api/outreach/review/approve-all', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const items = reviewQueue.get(userKey) || [];
  const results = [];

  for (const item of items) {
    try {
      if (item.type === 'email') {
        const { email, subject, body, resume, hrName, company, resumeType } = item.payload;
        const userPaths = getUserPaths(userKey);
        const candidateName = resume?.personalInfo?.name || 'Resume';
        const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_${Date.now()}.pdf`);
        await generateResumePdf(resume || getUserResume(userKey), tempPdfPath);
        const result = await sendGmail(email, subject, body, tempPdfPath, userKey);
        try { if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath); } catch (e) {}

        addUserLog(userKey, {
          type: 'Single Email',
          email,
          hrEmail: email,
          hrName: hrName || 'HR',
          company: company || 'Company',
          subject,
          body,
          status: 'Sent (Approved All from Review Queue)',
          resumeType: resumeType || 'Standard',
          messageId: result.id
        });
        results.push({ id: item.id, status: 'Sent' });
      }
    } catch (err) {
      results.push({ id: item.id, status: 'Failed', error: err.message });
    }
  }

  reviewQueue.set(userKey, []);
  res.json({ success: true, results, processedCount: results.length });
});


// Clear/Reset Automation Lock for User
app.post('/api/naukri/unlock', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const { releaseUserLockAsync } = require('./services/naukri.service');
    await releaseUserLockAsync(userKey);
    res.json({ success: true, message: `Automation lock for account "${userKey}" has been cleared.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- NAUKRI 1-CLICK EASY APPLY & SMART Q&A MEMORY ENDPOINTS (STORE & RETRIEVE FROM DB) ---
app.get('/api/naukri/qa', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const qaItems = await getQaDatabaseAsync(userKey);
    res.json({ qaItems: Array.isArray(qaItems) ? qaItems : [] });
  } catch (e) {
    res.json({ qaItems: getQaDatabase(userKey) });
  }
});

app.post('/api/naukri/qa', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const item = await saveQaItemAsync(userKey, req.body || {});
    const qaItems = await getQaDatabaseAsync(userKey);
    res.json({ success: true, item, qaItems });
  } catch (e) {
    const item = saveQaItem(userKey, req.body || {});
    res.json({ success: true, item, qaItems: getQaDatabase(userKey) });
  }
});

app.delete('/api/naukri/qa/:id', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    await deleteQaItemAsync(userKey, req.params.id);
    const qaItems = await getQaDatabaseAsync(userKey);
    res.json({ success: true, qaItems });
  } catch (e) {
    deleteQaItem(userKey, req.params.id);
    res.json({ success: true, qaItems: getQaDatabase(userKey) });
  }
});

app.get('/api/naukri/qa/pending', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({ pending: getPendingQuestions(userKey) });
});

app.post('/api/naukri/qa/answer-pending', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { id, answer } = req.body;
  try {
    const result = await resolvePendingQuestionAsync(userKey, id, answer);
    const qaItems = await getQaDatabaseAsync(userKey);
    res.json({ ...result, pending: getPendingQuestions(userKey), qaItems });
  } catch (e) {
    const result = resolvePendingQuestion(userKey, id, answer);
    res.json({ ...result, pending: getPendingQuestions(userKey), qaItems: getQaDatabase(userKey) });
  }
});

app.post('/api/naukri/qa/batch', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'items must be an array' });
  }
  try {
    for (const item of items) {
      if (item && item.question && item.answer) {
        await saveQaItemAsync(userKey, {
          question: item.question.trim(),
          answer: String(item.answer).trim(),
          category: item.category || 'Recruiter Screening'
        });
        if (item.pendingId) {
          await resolvePendingQuestionAsync(userKey, item.pendingId, String(item.answer).trim());
        }
      }
    }
    const qaItems = await getQaDatabaseAsync(userKey);
    const pending = getPendingQuestions(userKey);
    res.json({ success: true, count: items.length, qaItems, pending });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- NAUKRI CONTINUOUS PORTFOLIO CHECKER & SMART MICRO-UPDATER ENDPOINTS ---
app.get('/api/naukri/portfolio', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const config = await getNaukriConfigAsync(userKey);
    let portfolio = config.portfolio;
    // If not yet fetched, fetch live portfolio
    if (!portfolio || !portfolio.headline) {
      portfolio = await checkNaukriPortfolio(userKey);
    }
    res.json({ success: true, portfolio, config: {
      continuousPortfolioEnabled: config.continuousPortfolioEnabled !== false,
      autoMicroUpdateEnabled: Boolean(config.autoMicroUpdateEnabled),
      autoMicroUpdateIntervalMinutes: config.autoMicroUpdateIntervalMinutes || 60,
      applyAllAtOnce: Boolean(config.applyAllAtOnce)
    }});
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/portfolio/check', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const portfolio = await checkNaukriPortfolio(userKey);
    res.json({ success: true, portfolio, message: 'Portfolio inspected and updated successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/portfolio/micro-update', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = await applyNaukriMicroChanges(userKey, req.body || {});
    const config = await getNaukriConfigAsync(userKey);
    res.json({ success: true, ...result, portfolio: config.portfolio });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/naukri/portfolio/config', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const config = await getNaukriConfigAsync(userKey);
    res.json({
      success: true,
      config: {
        continuousPortfolioEnabled: config.continuousPortfolioEnabled ?? true,
        autoMicroUpdateEnabled: config.autoMicroUpdateEnabled ?? true,
        autoMicroUpdateIntervalMinutes: config.autoMicroUpdateIntervalMinutes ?? 60,
        applyAllAtOnce: config.applyAllAtOnce ?? false
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/portfolio/config', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const config = await getNaukriConfigAsync(userKey);
    const { continuousPortfolioEnabled, autoMicroUpdateEnabled, autoMicroUpdateIntervalMinutes, applyAllAtOnce } = req.body || {};
    if (typeof continuousPortfolioEnabled !== 'undefined') config.continuousPortfolioEnabled = continuousPortfolioEnabled;
    if (typeof autoMicroUpdateEnabled !== 'undefined') config.autoMicroUpdateEnabled = autoMicroUpdateEnabled;
    if (typeof autoMicroUpdateIntervalMinutes !== 'undefined') config.autoMicroUpdateIntervalMinutes = autoMicroUpdateIntervalMinutes;
    if (typeof applyAllAtOnce !== 'undefined') config.applyAllAtOnce = applyAllAtOnce;
    await saveNaukriConfigAsync(userKey, config);
    res.json({ success: true, config: {
      continuousPortfolioEnabled: config.continuousPortfolioEnabled,
      autoMicroUpdateEnabled: config.autoMicroUpdateEnabled,
      autoMicroUpdateIntervalMinutes: config.autoMicroUpdateIntervalMinutes,
      applyAllAtOnce: config.applyAllAtOnce
    }});
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Job Discovery & Filter Configurations (Configurable diversity limits, keywords, roles)
app.get('/api/naukri/filters', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({ filters: getFilterConfig(userKey) });
});

app.post('/api/naukri/filters', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const updated = saveFilterConfig(userKey, req.body || {});
  res.json({ success: true, filters: updated });
});

// Application State Machine Queue
app.get('/api/naukri/queue', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({
    queue: getNaukriQueue(userKey),
    stats: getTodayAppliedStats(userKey)
  });
});

app.delete('/api/naukri/queue', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({ success: true, queue: clearNaukriQueue(userKey) });
});

app.post('/api/naukri/queue/update', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { jobId, updates } = req.body;
  const updated = updateQueueItemState(userKey, jobId, updates || {});
  res.json({ success: true, item: updated, queue: getNaukriQueue(userKey) });
});

// Live Easy Apply Execution (Asynchronous non-blocking trigger with real-time status stream)
app.post('/api/naukri/apply/start', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const options = req.body || {};
  const currentStatus = getAutoApplyStatus();

  if (currentStatus && currentStatus.running) {
    return res.json({
      success: true,
      started: false,
      alreadyRunning: true,
      message: 'Naukri Auto-Apply is already in progress.',
      status: currentStatus
    });
  }

  // Start in background without hanging client HTTP request
  runStandaloneNaukriApply(userKey, options).catch(err => {
    console.warn(`[ASYNC EASY APPLY WARN for ${userKey}]:`, err.message);
  });

  res.json({
    success: true,
    started: true,
    message: 'Easy Apply started in background.',
    status: getAutoApplyStatus()
  });
});

app.get('/api/naukri/apply/history', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({
    applications: getNaukriAppliedJobs(userKey),
    appliedCompanies: getNaukriCompanyApplicationSummary(userKey),
    todayStats: getTodayAppliedStats(userKey),
    queue: getNaukriQueue(userKey),
    pending: getPendingQuestions(userKey)
  });
});

app.get('/api/naukri/applied-companies', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({
    companies: getNaukriCompanyApplicationSummary(userKey)
  });
});

app.get('/api/naukri/external-jobs', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.json({
    success: true,
    externalJobs: getNaukriExternalJobs(userKey)
  });
});

app.get('/api/naukri/apply/status', (req, res) => {
  res.json(getAutoApplyStatus());
});

app.post('/api/naukri/verify-otp', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { otp } = req.body;
  if (!otp || typeof otp !== 'string' || otp.trim().length === 0) {
    return res.status(400).json({ error: 'Please enter the 6-digit OTP code.' });
  }
  try {
    const result = await verifyNaukriOtp(userKey, otp.trim());
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/naukri/session/status', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const status = await getNaukriSessionStatusAsync(userKey);
    res.json({ success: true, ...status });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/naukri/session/cookies', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const statusInfo = await getNaukriSessionStatusAsync(userKey);
  let cookies = getNaukriSessionCookies(userKey);
  if ((!cookies || cookies.length === 0) && isSupabaseConfigured()) {
    try {
      const cloudConf = await supabaseGetNaukriConfig(userKey);
      if (cloudConf && Array.isArray(cloudConf.sessionCookies) && cloudConf.sessionCookies.length > 0) {
        cookies = cloudConf.sessionCookies;
        const paths = getUserPaths(userKey);
        fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookies, null, 2), 'utf8');
      }
    } catch (e) {}
  }

  // Redacted cookie metadata - never expose raw cookie values
  const sanitizedCookies = (cookies || []).map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    hasValue: Boolean(c.value),
    value: 'Stored Securely'
  }));

  res.json({
    success: true,
    hasSession: Array.isArray(cookies) && cookies.length > 0,
    cookieCount: Array.isArray(cookies) ? cookies.length : 0,
    cookies: sanitizedCookies,
    storedInDb: isSupabaseConfigured(),
    status: statusInfo.status,
    authenticated: statusInfo.authenticated,
    lastVerifiedAt: statusInfo.lastVerifiedAt,
    lastUpdatedAt: statusInfo.lastUpdatedAt
  });
});

// Mask sensitive config before sending to frontend
function maskSensitiveConfig(conf) {
  if (!conf) return {};
  const masked = { ...conf };
  if (masked.password) masked.password = '••••••••';
  if (Array.isArray(masked.sessionCookies)) {
    masked.sessionCookies = masked.sessionCookies.map(c => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
      hasValue: Boolean(c.value),
      value: 'Stored Securely'
    }));
  }
  return masked;
}

app.get('/api/naukri/session', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const statusInfo = await getNaukriSessionStatusAsync(userKey);
  const cookies = getNaukriSessionCookies(userKey);
  const sanitizedCookies = (cookies || []).map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    hasValue: Boolean(c.value),
    value: 'Stored Securely'
  }));

  res.json({
    success: true,
    ...statusInfo,
    cookies: sanitizedCookies,
    storedInDb: isSupabaseConfigured()
  });
});

app.post('/api/naukri/import-session', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { cookies } = req.body;
  if (!cookies) {
    return res.status(400).json({ error: 'Please provide session cookies.' });
  }
  try {
    const result = await saveNaukriSessionCookiesAsync(userKey, cookies);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/naukri/clear-session', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = await clearNaukriSessionAsync(userKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.all('/api/naukri/session/validate', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = await validateNaukriSession(userKey);
    const config = await getNaukriConfigAsync(userKey);
    res.json({ success: true, ...result, config: maskSensitiveConfig(config) });
  } catch (e) {
    const config = await getNaukriConfigAsync(userKey);
    res.status(500).json({ success: false, error: e.message, config: maskSensitiveConfig(config) });
  }
});

app.post('/api/naukri/apply/resume-job', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { jobId, answer, pendingId } = req.body;
  try {
    if (pendingId && answer) {
      await resolvePendingQuestionAsync(userKey, pendingId, answer);
    }
    if (jobId) {
      updateQueueItemState(userKey, jobId, {
        state: 'READY_TO_RESUME',
        stage: 'Ready to Resume Execution'
      });
    }
    res.json({
      success: true,
      message: `Application for ${jobId || 'job'} is now marked READY_TO_RESUME.`,
      queue: getNaukriQueue(userKey)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/apply/retry-instant', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { jobId, jobUrl, userAnswers } = req.body;
  if (!jobUrl) {
    return res.status(400).json({ success: false, error: 'jobUrl is required for instant application retry' });
  }
  try {
    const result = await retryAndApplySingleJobInstantAsync(userKey, { jobId, jobUrl, userAnswers });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/apply/retry-all-unconfirmed', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { userAnswers } = req.body || {};
  try {
    // Run asynchronously in background so client request never times out
    applyAllUnconfirmedJobsAsync(userKey, userAnswers).catch(err => {
      console.error(`[BATCH UNCONFIRMED ERROR for ${userKey}]`, err.message);
    });
    res.json({
      success: true,
      message: 'Background application worker started for all unconfirmed jobs! Live progress will update in the table.'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/session/start', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { jobId, jobUrl, company, jobTitle } = req.body;
  if (!jobUrl) {
    return res.status(400).json({ success: false, error: 'jobUrl is required to start a live application session' });
  }
  try {
    const result = await startNaukriInteractiveApplySessionAsync(userKey, { jobId, jobUrl, company, jobTitle });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/naukri/session/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const status = getNaukriInteractiveSessionStatus(sessionId);
  res.json({ success: true, ...status });
});

app.post('/api/naukri/session/answer', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { sessionId, answer } = req.body;
  if (!sessionId || answer === undefined) {
    return res.status(400).json({ success: false, error: 'sessionId and answer are required' });
  }
  try {
    const result = await submitNaukriSessionAnswerAsync(userKey, { sessionId, answer });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naukri/session/cancel', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }
  try {
    const result = await cancelNaukriInteractiveSession(sessionId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==========================================
// BATCH-FIRST SCREENING-QUESTION API ROUTES
// ==========================================

// STAGE 1: Start Batch Inspection
app.post('/api/naukri/batch/inspect-start', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { jobIds } = req.body || {};
  try {
    const result = await inspectBatchJobQuestionsAsync(userKey, { jobIds });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// STAGE 1: Get Batch Inspection Status
app.get('/api/naukri/batch/inspect-status', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const status = getBatchInspectionStatus(userKey);
  res.json({ success: true, status });
});

// STAGE 1: Pause Batch Inspection
app.post('/api/naukri/batch/inspect-pause', (req, res) => {
  const result = pauseBatchInspection();
  res.json(result);
});

// STAGE 2: Get Consolidated Unique Questions & Answers
app.get('/api/naukri/batch/questions', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const data = getBatchScreeningData(userKey);
  res.json({
    success: true,
    data: {
      lastInspectedAt: data.lastInspectedAt,
      totalJobs: data.totalJobs,
      inspectedCount: data.inspectedCount,
      questionsFoundCount: data.questionsFoundCount,
      uniqueQuestionsCount: data.consolidatedQuestions?.length || 0,
      noQuestionsCount: data.noQuestionsCount,
      failedCount: data.failedCount,
      consolidatedQuestions: data.consolidatedQuestions || [],
      answers: data.answers || {},
      jobQuestionsMap: data.jobQuestionsMap || {}
    }
  });
});

// STAGE 2: Save Answers Once For Unique Questions
app.post('/api/naukri/batch/save-answers', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { answers } = req.body || {};
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ success: false, error: 'answers object is required' });
  }
  try {
    const result = await saveBatchScreeningAnswersAsync(userKey, answers);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// STAGE 3: Start Batch Apply With Answers
app.post('/api/naukri/batch/apply-start', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { answers, jobIds, force } = req.body || {};
  try {
    const result = await applyBatchWithAnswersAsync(userKey, { answers, jobIds, force });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// STAGE 3: Get Batch Apply Status
app.get('/api/naukri/batch/apply-status', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const status = getBatchApplyStatus(userKey);
  res.json({ success: true, status });
});

// STAGE 3: Pause Batch Apply
app.post('/api/naukri/batch/apply-pause', (req, res) => {
  const result = pauseBatchApply();
  res.json(result);
});

// Real-time Push Notifications SSE Stream for Frontend Web App
app.get('/api/notifications/stream', (req, res) => {
  const userKey = resolveUserKey(req, res);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const { registerSseClient } = require('./services/notification.service');
  registerSseClient(userKey, res);
});

// Notifications history and device push topic info
app.get('/api/notifications', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { getUserNotificationTopic, getNotificationHistory } = require('./services/notification.service');
  const topic = getUserNotificationTopic(userKey);
  const history = getNotificationHistory(userKey);
  res.json({
    success: true,
    userKey,
    ntfyTopic: topic,
    ntfyUrl: `https://ntfy.sh/${topic}`,
    notifications: history
  });
});

// Test Push Notification across all devices (mobile phone via ntfy.sh, browser desktop, email)
app.post('/api/notifications/test', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const { sendTestNotification } = require('./services/notification.service');
    const result = await sendTestNotification(userKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// High-Speed Turbo Apply All Trigger
app.post('/api/naukri/apply-all-fast', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const { triggerFastApplyAll } = require('./services/naukri.service');
    const result = await triggerFastApplyAll(userKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/naukri/apply/reconcile', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { findBrowserExecutable, getNaukriConfig, restoreAndInjectNaukriSession } = require('./services/naukri.service');
  const puppeteer = require('puppeteer');

  let browser = null;
  try {
    const config = getNaukriConfig(userKey);
    const browserPath = findBrowserExecutable();
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: browserPath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await restoreAndInjectNaukriSession(page, userKey);

    const result = await reconcileNaukriAppliedJobs(page, userKey);
    res.json({
      ...result,
      todayStats: getTodayAppliedStats(userKey),
      applications: getNaukriAppliedJobs(userKey)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (err) {}
    }
  }
});

// --- 24/7 CONTAINER HEALTH & KEEP-ALIVE ENDPOINTS ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'Cold Reach AI & Profile Booster',
    schedulers: {
      linkedin30Min: true,
      naukriQuarterDay: true,
      antiSleepHeartbeat: true
    },
    keepAlive: getKeepAliveStatus(PORT)
  });
});

app.get('/api/keepalive/status', (req, res) => {
  res.json(getKeepAliveStatus(PORT));
});

// --- ADMIN CONTROL CENTER (Exclusively for tksanthosh494@gmail.com) ---
const { getAdminOverview, getAdminUserDetails } = require('./services/admin.service');

function requireAdminAuth(req, res, next) {
  const context = resolveUserContext(req, res);
  const email = (context.user?.email || '').toLowerCase().trim();

  if (email === 'tksanthosh494@gmail.com') {
    return next();
  }

  return res.status(403).json({
    error: 'Access Denied: Admin control center is exclusively restricted to tksanthosh494@gmail.com.'
  });
}

app.get('/api/admin/overview', requireAdminAuth, async (req, res) => {
  try {
    const data = await getAdminOverview();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/user/:userKey', requireAdminAuth, async (req, res) => {
  try {
    const data = await getAdminUserDetails(req.params.userKey);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- PUBLIC PRIVACY POLICY & TERMS OF SERVICE (For Google OAuth Verification) ---
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Privacy Policy - Cold Reach AI</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#1e293b;}h1{color:#4f46e5;}</style></head><body><h1>Privacy Policy</h1><p>Last updated: August 2026</p><p>Cold Reach AI ("we", "our", or "us") respects your privacy. We use Google OAuth strictly to send recruiter outreach emails upon your explicit request.</p><h2>1. Data Collection & Isolation</h2><p>All candidate profile data, resume templates, and Gmail credentials are encrypted and strictly partitioned per Google user account.</p><h2>2. Contact</h2><p>For inquiries, contact tksanthosh494@gmail.com.</p></body></html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Terms of Service - emailSender</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#1e293b;}h1{color:#4f46e5;}</style></head><body><h1>Terms of Service</h1><p>Last updated: August 2026</p><p>By using emailSender, you agree to use our automated outreach tools in compliance with standard email sending and job application guidelines.</p><h2>Contact</h2><p>For inquiries, contact tksanthosh494@gmail.com.</p></body></html>`);
});

// Google Search Console Verification Endpoint
app.get('/googlefe5b13cb88557756.html', (req, res) => {
  res.send('google-site-verification: googlefe5b13cb88557756.html');
});

// Interactive 1-Minute Automated Demo Walkthrough for Google OAuth Verification
app.get('/demo', (req, res) => {
  const demoPath = path.join(__dirname, '../../demo_walkthrough.html');
  if (fs.existsSync(demoPath)) {
    return res.sendFile(demoPath);
  }
  res.redirect('/');
});

// --- DATABASE PERSISTENCE & HYDRATION API ---
app.get('/api/database/status', (req, res) => {
  res.json({
    configured: isSupabaseConfigured(),
    type: isSupabaseConfigured() ? 'Supabase PostgreSQL (Cloud Persistent)' : 'Local File JSON / Gzip',
    features: {
      users: true,
      resumes: true,
      applications: true,
      outreachLogs: true,
      naukriConfig: true,
      naukriHistory: true,
      scheduledJobs: true,
      linkedInConfig: true
    }
  });
});

app.post('/api/database/sync', async (req, res) => {
  const { userKey } = resolveUserContext(req, res);
  if (!userKey) {
    return res.status(401).json({ error: 'Authentication required to trigger database sync.' });
  }

  try {
    const success = await hydrateUserSandboxFromDatabase(userKey);
    res.json({
      success: true,
      message: success
        ? 'User sandbox successfully synced and hydrated from Supabase database.'
        : 'Local sandbox active (Supabase not configured or already up to date).'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-restore from committed seed backup if present on cold deploy
const seedBackupPath = path.join(__dirname, '../seed_backup.json');
if (fs.existsSync(seedBackupPath)) {
  try {
    const seedData = JSON.parse(fs.readFileSync(seedBackupPath, 'utf8'));
    restoreFullBackup(USERS_DIR, seedData);
    console.log('[INFO] Restored persistent user logs and applications from seed archive.');
  } catch (e) {
    console.warn('[WARN] Failed to auto-restore from seed backup:', e.message);
  }
}

/**
 * Startup 2-Way Database Hydration:
 * Automatically pulls all users, resumes, applications, outreach logs,
 * scheduled jobs, and Naukri/LinkedIn configs from Supabase cloud database
 * so zero data is lost across fresh container builds or redeploys!
 */
async function initDatabaseStartupSync() {
  if (!isSupabaseConfigured()) {
    console.log('[DATABASE PERSISTENCE] Supabase not configured. Using local JSON / Gzip storage.');
    return;
  }

  console.log('[DATABASE PERSISTENCE] Checking Supabase cloud database for existing users & persistent records...');
  try {
    const allUsers = await supabaseGetAllUsers();
    console.log(`[DATABASE PERSISTENCE] Discovered ${allUsers.length} user account(s) in Supabase database.`);

    for (const u of allUsers) {
      if (!u.userKey) continue;
      ensureUserSandbox(u.userKey, { email: u.email, name: u.name, picture: u.picture });
      await hydrateUserSandboxFromDatabase(u.userKey);

      // Hydrate Naukri config and session if present
      const naukriConf = await supabaseGetNaukriConfig(u.userKey);
      if (naukriConf) {
        const uPaths = getUserPaths(u.userKey);
        fs.writeFileSync(uPaths.naukriConfigPath, JSON.stringify(naukriConf, null, 2), 'utf8');
        if (Array.isArray(naukriConf.sessionCookies) && naukriConf.sessionCookies.length > 0) {
          fs.writeFileSync(uPaths.naukriSessionPath, JSON.stringify(naukriConf.sessionCookies, null, 2), 'utf8');
        }
      }

      // Hydrate Naukri history if present
      const naukriHist = await supabaseGetNaukriHistory(u.userKey);
      if (Array.isArray(naukriHist) && naukriHist.length > 0) {
        const uPaths = getUserPaths(u.userKey);
        fs.writeFileSync(uPaths.naukriHistoryPath, JSON.stringify(naukriHist, null, 2), 'utf8');
      }
    }

    // Hydrate Scheduled Jobs from Supabase
    const dbJobs = await supabaseGetScheduledJobs();
    if (Array.isArray(dbJobs) && dbJobs.length > 0) {
      const scheduleFile = path.join(__dirname, '../../scheduled.json');
      fs.writeFileSync(scheduleFile, JSON.stringify(dbJobs, null, 2), 'utf8');
      console.log(`[DATABASE PERSISTENCE] Restored ${dbJobs.length} scheduled outreach email(s) from Supabase.`);
    }

    // Hydrate LinkedIn automated outreach config from Supabase
    const dbLinkedInConf = await supabaseGetLinkedInConfig();
    if (dbLinkedInConf) {
      const linkedInFile = path.join(__dirname, '../../linkedin_config.json');
      fs.writeFileSync(linkedInFile, JSON.stringify(dbLinkedInConf, null, 2), 'utf8');
      console.log('[DATABASE PERSISTENCE] Restored LinkedIn automated outreach config from Supabase.');
    }

    console.log('[DATABASE PERSISTENCE] ✅ Full database-first hydration complete. Zero data loss on redeploys!');
  } catch (err) {
    console.warn('[DATABASE PERSISTENCE WARN]', err.message);
  }
}

// Async Database-First Bootstrap
async function startServer() {
  // 1. Serve production client assets
  const clientDistPath = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // 2. Guarantee that ANY unhandled /api route ALWAYS returns JSON, never HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  // Global error handler for /api routes to prevent Express from sending HTML
  app.use((err, req, res, next) => {
    if (req.path && req.path.startsWith('/api')) {
      console.error('[API ERROR]', err);
      return res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
    next(err);
  });

  // 3. Start HTTP Server immediately so endpoints are instantly available
  app.listen(PORT, () => {
    console.log(`[INFO] Cold Email Backend running 24/7 on http://localhost:${PORT}`);
  });

  // 4. Background Database Hydration & Schedulers
  initDatabaseStartupSync()
    .then(() => {
      console.log('[DATABASE PERSISTENCE] Background sync finished successfully.');
    })
    .catch(err => {
      console.warn('[DATABASE PERSISTENCE WARN]', err.message);
    });

  initScheduler();
  initLinkedInScheduler();
  initNaukriScheduler();
  initKeepAliveService(PORT);
}

startServer().catch(err => {
  console.error('[FATAL STARTUP ERROR]', err);
  process.exit(1);
});
