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
const { harvestRecruiterPosts, parsePastedLinkedInPost, runLinkedInOutreachJob, getLinkedInConfig, saveLinkedInConfig, initLinkedInScheduler } = require('./services/linkedin.service');
const { getNaukriConfig, saveNaukriConfig, getNaukriHistory, clearNaukriHistory, saveNaukriSessionCookies, clearNaukriSession, uploadResumeToNaukri, verifyNaukriOtp, startInteractiveGoogleSsoLogin, initNaukriScheduler } = require('./services/naukri.service');
const { initKeepAliveService, getKeepAliveStatus } = require('./services/keepalive.service');
const { generateTokens, verifyAccessToken, verifyRefreshToken, ONE_MONTH_SECONDS } = require('./services/jwt.service');
const {
  getUserKeyFromEmail,
  getUserPaths,
  ensureUserSandbox,
  getUserProfile,
  getUserResume,
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

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: true, // Reflect request origin for cookies & credentials
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));

// Helper to resolve active user key from JWT Cookie, Authorization Header, or custom headers
function resolveUserContext(req, res = null) {
  // 1. Try JWT from Cookie
  const cookieToken = req.cookies?.auth_token;
  if (cookieToken) {
    const decoded = verifyAccessToken(cookieToken);
    if (decoded && decoded.userKey) {
      return { userKey: decoded.userKey, user: decoded };
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
      return { userKey: refreshDecoded.userKey, user: profile };
    }
  }

  // 3. Try Authorization Bearer Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    if (decoded && decoded.userKey) {
      return { userKey: decoded.userKey, user: decoded };
    }
  }

  // 4. Try x-user-key header or query param if valid profile exists
  const headerKey = req.headers['x-user-key'] || req.query.userKey || req.body?.userKey;
  if (headerKey && typeof headerKey === 'string' && headerKey.trim().length > 0 && headerKey !== 'default_user' && headerKey !== 'null' && headerKey !== 'undefined') {
    const cleanKey = headerKey.trim();
    const profile = getUserProfile(cleanKey);
    if (profile) {
      return { userKey: cleanKey, user: profile };
    }
  }

  // 5. Unauthenticated guest / logged out
  return { userKey: null, user: null };
}

function resolveUserKey(req, res = null) {
  const ctx = resolveUserContext(req, res);
  return ctx.userKey || 'guest_user';
}

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
app.get('/api/resume', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const resumeData = getUserResume(userKey);
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
  const { email, subject, body, resume, hrName, company, resumeType } = req.body;
  if (!email || !subject || !body || !resume) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Your Gmail account is not connected. Please connect Gmail first.' });
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

    const userPaths = getUserPaths(userKey);
    const candidateName = resume?.personalInfo?.name || 'Resume';
    const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_${Date.now()}.pdf`);

    await generateResumePdf(resume, tempPdfPath);
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

    res.json({ success: true, result });
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
  const { email, subject, body, resume, hrName, company, resumeType } = req.body;
  if (!email || !subject || !body || !resume) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!isUserAuthorized(userKey)) {
    return res.status(401).json({ error: 'Your Gmail account is not connected.' });
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

    const userPaths = getUserPaths(userKey);
    const candidateName = resume?.personalInfo?.name || 'Resume';
    const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPdfPath = path.join(userPaths.uploadsDir, `${sanitizedName}_Draft_${Date.now()}.pdf`);

    await generateResumePdf(resume, tempPdfPath);
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

    res.json({ success: true, result });
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

app.post('/api/linkedin/parse-post', (req, res) => {
  const { text } = req.body;
  try {
    const lead = parsePastedLinkedInPost(text);
    const userKey = resolveUserKey(req, res);
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

// --- DEDICATED JD RESUME TAILOR & APPLICATION LOGS ENDPOINTS (Per-User Sandbox) ---
app.post('/api/applications/tailor', async (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { role, company, jd } = req.body;
  if (!jd || jd.trim().length === 0) {
    return res.status(400).json({ error: 'Job description (JD) is required.' });
  }

  try {
    const standardResume = getUserResume(userKey);
    const tailoredResume = await tailorResume(standardResume, jd);

    if (role && role.trim().length > 0) {
      tailoredResume.personalInfo = tailoredResume.personalInfo || {};
      tailoredResume.personalInfo.title = role.trim();
    }

    const userPaths = getUserPaths(userKey);
    const appId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const pdfFilename = `tailored_resume_${appId}.pdf`;
    const pdfPath = path.join(userPaths.uploadsDir, pdfFilename);

    await generateResumePdf(tailoredResume, pdfPath);

    const matchedSkills = Object.values(tailoredResume.skills || {}).flat().slice(0, 8);

    const newApplication = {
      id: appId,
      timestamp: new Date().toISOString(),
      role: role ? role.trim() : (tailoredResume.personalInfo?.title || 'Software Development Engineer'),
      company: company ? company.trim() : 'Target Company',
      jd: jd.trim(),
      jdSnippet: jd.trim().slice(0, 180) + (jd.trim().length > 180 ? '...' : ''),
      matchedSkills,
      tailoredResume,
      pdfFilename,
      status: 'Tailored & Ready'
    };

    const apps = getUserApplications(userKey);
    apps.unshift(newApplication);
    saveUserApplications(userKey, apps);

    res.json({ success: true, application: newApplication });
  } catch (e) {
    console.error('Failed to tailor resume for JD:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    res.json({ applications: getUserApplications(userKey) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/applications/sync', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const clientApps = req.body?.applications || [];
  try {
    const mergedApps = syncUserApplications(userKey, clientApps);
    res.json({ applications: mergedApps, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications/:id/pdf', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { id } = req.params;
  const apps = getUserApplications(userKey);
  const appItem = apps.find(a => a.id === id);

  if (!appItem || !appItem.pdfFilename) {
    return res.status(404).json({ error: 'Application record or PDF not found' });
  }

  const userPaths = getUserPaths(userKey);
  const pdfPath = path.join(userPaths.uploadsDir, appItem.pdfFilename);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF file not found on server' });
  }

  const candidateName = appItem.tailoredResume?.personalInfo?.name || 'Santhosh T K';
  const downloadName = candidateName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') + '.pdf';

  res.download(pdfPath, downloadName);
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
    const paths = getUserPaths(userKey);
    if (!fs.existsSync(paths.naukriConfigPath) || !fs.existsSync(paths.naukriSessionPath)) {
      await hydrateUserSandboxFromDatabase(userKey);
    }
  }
  res.json({ config: getNaukriConfig(userKey) });
});

app.post('/api/naukri/config', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const updated = saveNaukriConfig(userKey, req.body || {});
  res.json({ success: true, config: updated });
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

app.post('/api/naukri/import-session', (req, res) => {
  const userKey = resolveUserKey(req, res);
  const { cookies } = req.body;
  if (!cookies) {
    return res.status(400).json({ error: 'Please provide session cookies.' });
  }
  try {
    const result = saveNaukriSessionCookies(userKey, cookies);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/naukri/clear-session', (req, res) => {
  const userKey = resolveUserKey(req, res);
  try {
    const result = clearNaukriSession(userKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  // 1. Fully hydrate all users, resumes, applications, logs, session cookies, and configs from Supabase
  await initDatabaseStartupSync();

  // 2. Initialize background schedulers & 24/7 Keep-Alive Anti-Sleep Heartbeat
  initScheduler();
  initLinkedInScheduler();
  initNaukriScheduler();
  initKeepAliveService(PORT);

  // 3. Serve production client assets
  const clientDistPath = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // 4. Start HTTP Server
  app.listen(PORT, () => {
    console.log(`[INFO] Cold Email Backend running 24/7 on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[FATAL STARTUP ERROR]', err);
  process.exit(1);
});
