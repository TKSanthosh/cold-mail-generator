const express = require('express');
const cors = require('cors');
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

const app = express();
const PORT = process.env.PORT || 5000;
const RESUME_PATH = process.env.RESUME_PATH || path.join(__dirname, '../resume.json');
const LOGS_PATH = process.env.LOGS_PATH || path.join(__dirname, '../logs.json');

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json({ limit: '20mb' }));

// Verify configuration on boot
if (!fs.existsSync(RESUME_PATH)) {
  console.warn(`[WARN] Standard resume JSON not found at ${RESUME_PATH}. Creating a blank one.`);
  const defaultResume = {
    personalInfo: { name: "", title: "", email: "", phone: "", location: "", github: "", linkedin: "" },
    summary: "",
    skills: {},
    experience: [],
    projects: [],
    education: []
  };
  fs.writeFileSync(RESUME_PATH, JSON.stringify(defaultResume, null, 2), 'utf8');
}

if (!fs.existsSync(LOGS_PATH)) {
  fs.writeFileSync(LOGS_PATH, JSON.stringify([], null, 2), 'utf8');
}

function addLogEntry(entry) {
  try {
    let logs = [];
    if (fs.existsSync(LOGS_PATH)) {
      logs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
    }
    logs.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save log entry:', e);
  }
}

// Ensure temp/uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- AUTH ROUTING ---
app.get('/api/auth/url', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  try {
    await handleCallbackCode(code);
    // Redirect to frontend app home
    res.redirect('http://localhost:5174/?auth=success');
  } catch (e) {
    console.error('OAuth callback exchange error:', e);
    res.status(500).send(`Authentication failed: ${e.message}`);
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ authorized: isAuthorized() });
});

app.post('/api/auth/logout', (req, res) => {
  try {
    logout();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- RESUME TEMPLATE ROUTING ---
app.get('/api/resume', (req, res) => {
  try {
    const resumeData = JSON.parse(fs.readFileSync(RESUME_PATH, 'utf8'));
    res.json(resumeData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/resume', (req, res) => {
  try {
    fs.writeFileSync(RESUME_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/resume/upload', async (req, res) => {
  const { pdfBase64 } = req.body;
  if (!pdfBase64) {
    return res.status(400).json({ error: 'Missing pdfBase64 file data' });
  }

  const uploadPdfPath = path.join(UPLOADS_DIR, `Uploaded_Resume_${Date.now()}.pdf`);
  try {
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(uploadPdfPath, buffer);

    const scriptPath = path.join(__dirname, 'utils/resume_extractor.py');
    exec(`python "${scriptPath}" "${uploadPdfPath}"`, (error, stdout, stderr) => {
      // Clean up uploaded temp file
      if (fs.existsSync(uploadPdfPath)) {
        fs.unlinkSync(uploadPdfPath);
      }

      if (error) {
        console.error('Resume extraction error:', stderr || error.message);
        return res.status(500).json({ error: stderr || error.message });
      }

      try {
        const parsedResume = JSON.parse(stdout.trim());
        res.json({ success: true, resume: parsedResume });
      } catch (err) {
        res.status(500).json({ error: 'Failed to parse extracted JSON output' });
      }
    });
  } catch (e) {
    if (fs.existsSync(uploadPdfPath)) {
      fs.unlinkSync(uploadPdfPath);
    }
    res.status(500).json({ error: e.message });
  }
});

// --- GENERATION ENDPOINT ---
app.post('/api/generate', async (req, res) => {
  const { email, jd } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'HR Email address is required' });
  }

  try {
    const { name, company, domain } = parseHrEmail(email);

    // Step 0: Live Internet Scraping for Company Background & Intelligence
    const companyIntel = await scrapeCompanyIntel(company, domain);

    const standardResume = JSON.parse(fs.readFileSync(RESUME_PATH, 'utf8'));

    // Step 1: Generate Tailored Resume (if JD is provided)
    let tailoredResume = standardResume;
    if (jd && jd.trim().length > 0) {
      tailoredResume = await tailorResume(standardResume, jd);
    }

    // Step 2: Generate Cold Email Body (informed by live company intelligence)
    const emailContent = await generateColdEmail(name, company, jd, tailoredResume, companyIntel);

    res.json({
      name,
      company,
      companyIntel,
      email: emailContent,
      resume: tailoredResume
    });
  } catch (e) {
    console.error('Generation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- EMAIL SENDING ENDPOINT ---
app.post('/api/send', async (req, res) => {
  const { email, subject, body, resume, hrName, company, resumeType, jdSnippet } = req.body;
  if (!email || !subject || !body || !resume) {
    return res.status(400).json({ error: 'Missing email, subject, body, or resume parameter' });
  }

  if (!isAuthorized()) {
    return res.status(401).json({ error: 'Gmail account is not connected. Connect via OAuth first.' });
  }

  // Sanitize body if raw JSON was somehow passed
  let cleanBody = body;
  if (typeof cleanBody === 'string' && (cleanBody.trim().startsWith('{') || cleanBody.includes('"body":'))) {
    cleanBody = cleanBody
      .replace(/^\{[\s\S]*?"body"\s*:\s*"?/i, '')
      .replace(/"?\s*\}\s*$/, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  }

  let cleanSubject = subject;
  if (typeof cleanSubject === 'string' && cleanSubject.includes('"subject":')) {
    const sm = cleanSubject.match(/"subject"\s*:\s*"([^"]+)"/);
    if (sm) cleanSubject = sm[1];
  }

  const tempPdfPath = path.join(UPLOADS_DIR, `Resume_${Date.now()}.pdf`);
  const parsedInfo = parseHrEmail(email);
  const targetName = hrName || parsedInfo.name;
  const targetCompany = company || parsedInfo.company;
  const isTailored = resumeType === 'Tailored' || !!(jdSnippet && jdSnippet.trim().length > 0);

  try {
    // Generate tailored PDF
    await generateResumePdf(resume, tempPdfPath);

    // Send via Gmail
    const result = await sendGmail(email, cleanSubject, cleanBody, tempPdfPath);

    // Cleanup PDF
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }

    // Save Log
    addLogEntry({
      hrEmail: email,
      hrName: targetName,
      company: targetCompany,
      subject,
      body,
      resumeType: isTailored ? 'Tailored (with JD)' : 'Standard Resume',
      tailoredSummary: resume.summary || '',
      skillsHighlight: Object.values(resume.skills || {}).flat().slice(0, 8),
      status: 'Sent',
      messageId: result.id
    });

    res.json({ success: true, result });
  } catch (e) {
    console.error('Mail sending error:', e);
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }

    // Save Failed Log
    addLogEntry({
      hrEmail: email,
      hrName: targetName,
      company: targetCompany,
      subject,
      body,
      resumeType: isTailored ? 'Tailored (with JD)' : 'Standard Resume',
      status: 'Failed',
      error: e.message
    });

    res.status(500).json({ error: e.message });
  }
});

// Initialize background morning schedule dispatcher
initScheduler(addLogEntry);

// --- GMAIL DRAFT CREATION ENDPOINT (Schedule inside Gmail App) ---
app.post('/api/draft', async (req, res) => {
  const { email, subject, body, resume, hrName, company, resumeType, jdSnippet } = req.body;
  if (!email || !subject || !body || !resume) {
    return res.status(400).json({ error: 'Missing email, subject, body, or resume parameter' });
  }

  if (!isAuthorized()) {
    return res.status(401).json({ error: 'Gmail account is not connected. Connect via OAuth first.' });
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

  let cleanSubject = subject;
  if (typeof cleanSubject === 'string' && cleanSubject.includes('"subject":')) {
    const sm = cleanSubject.match(/"subject"\s*:\s*"([^"]+)"/);
    if (sm) cleanSubject = sm[1];
  }

  const tempPdfPath = path.join(UPLOADS_DIR, `Draft_Resume_${Date.now()}.pdf`);
  const parsedInfo = parseHrEmail(email);
  const targetName = hrName || parsedInfo.name;
  const targetCompany = company || parsedInfo.company;
  const isTailored = resumeType === 'Tailored' || !!(jdSnippet && jdSnippet.trim().length > 0);

  try {
    // Generate tailored 1-page PDF
    await generateResumePdf(resume, tempPdfPath);

    // Create Draft in Gmail App
    const result = await createGmailDraft(email, cleanSubject, cleanBody, tempPdfPath);

    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }

    addLogEntry({
      hrEmail: email,
      hrName: targetName,
      company: targetCompany,
      subject: cleanSubject,
      body: cleanBody,
      resumeType: isTailored ? 'Tailored (with JD)' : 'Standard Resume',
      tailoredSummary: resume.summary || '',
      status: 'Created Draft in Gmail App',
      draftId: result.id
    });

    res.json({ success: true, draft: result });
  } catch (e) {
    console.error('Draft creation error:', e);
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
    res.status(500).json({ error: e.message });
  }
});

// --- SCHEDULE DISPATCH ENDPOINTS ---
app.post('/api/schedule', (req, res) => {
  const { email, subject, body, resume, hrName, company, scheduledAt, resumeType } = req.body;
  if (!email || !subject || !body || !resume || !scheduledAt) {
    return res.status(400).json({ error: 'Missing required scheduling parameters' });
  }

  if (!isAuthorized()) {
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
  res.json({ jobs: getScheduledJobs() });
});

app.delete('/api/scheduled/:id', (req, res) => {
  cancelScheduledJob(req.params.id);
  res.json({ success: true });
});

// --- OUTREACH LOGS ENDPOINTS ---
app.get('/api/logs', (req, res) => {
  try {
    if (!fs.existsSync(LOGS_PATH)) {
      return res.json({ logs: [] });
    }
    const logs = JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/logs', (req, res) => {
  try {
    fs.writeFileSync(LOGS_PATH, JSON.stringify([], null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- BULK PREVIEW ENDPOINT ---
app.post('/api/bulk-parse', (req, res) => {
  const { emails } = req.body; // Array of emails
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Emails array is required' });
  }

  const parsed = emails.map(email => {
    const { name, company } = parseHrEmail(email);
    return { email, name, company };
  });

  res.json({ parsed });
});

// --- DEDICATED JD RESUME TAILOR & APPLICATION LOGS ENDPOINTS ---
const APPLICATIONS_PATH = process.env.APPLICATIONS_PATH || path.join(__dirname, '../applications.json');

if (!fs.existsSync(APPLICATIONS_PATH)) {
  fs.writeFileSync(APPLICATIONS_PATH, JSON.stringify([], null, 2), 'utf8');
}

function getApplications() {
  try {
    if (fs.existsSync(APPLICATIONS_PATH)) {
      return JSON.parse(fs.readFileSync(APPLICATIONS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read applications.json:', e);
  }
  return [];
}

function saveApplications(apps) {
  try {
    fs.writeFileSync(APPLICATIONS_PATH, JSON.stringify(apps, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save applications.json:', e);
  }
}

app.post('/api/applications/tailor', async (req, res) => {
  const { role, company, jd } = req.body;
  if (!jd || jd.trim().length === 0) {
    return res.status(400).json({ error: 'Job description (JD) is required.' });
  }

  try {
    let standardResume = {};
    if (fs.existsSync(RESUME_PATH)) {
      standardResume = JSON.parse(fs.readFileSync(RESUME_PATH, 'utf8'));
    }

    // Call LLM to tailor the resume
    const tailoredResume = await tailorResume(standardResume, jd);

    // If role is provided, align the title in personalInfo
    if (role && role.trim().length > 0) {
      tailoredResume.personalInfo = tailoredResume.personalInfo || {};
      tailoredResume.personalInfo.title = role.trim();
    }

    const appId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const pdfFilename = `tailored_resume_${appId}.pdf`;
    const pdfPath = path.join(UPLOADS_DIR, pdfFilename);

    // Compile 1-Page PDF
    await generateResumePdf(tailoredResume, pdfPath);

    // Extract matched skills from tailored resume
    const matchedSkills = Object.values(tailoredResume.skills || {}).flat().slice(0, 8);

    const newApplication = {
      id: appId,
      timestamp: new Date().toISOString(),
      role: role ? role.trim() : (tailoredResume.personalInfo?.title || 'Software Development Engineer 2'),
      company: company ? company.trim() : 'Target Company',
      jd: jd.trim(),
      jdSnippet: jd.trim().slice(0, 180) + (jd.trim().length > 180 ? '...' : ''),
      matchedSkills,
      tailoredResume,
      pdfFilename,
      status: 'Tailored & Ready'
    };

    const apps = getApplications();
    apps.unshift(newApplication);
    saveApplications(apps);

    res.json({ success: true, application: newApplication });
  } catch (e) {
    console.error('Failed to tailor resume for JD:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications', (req, res) => {
  try {
    res.json({ applications: getApplications() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/applications/:id/pdf', (req, res) => {
  const { id } = req.params;
  const apps = getApplications();
  const appItem = apps.find(a => a.id === id);

  if (!appItem || !appItem.pdfFilename) {
    return res.status(404).json({ error: 'Application record or PDF not found' });
  }

  const pdfPath = path.join(UPLOADS_DIR, appItem.pdfFilename);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'PDF file not found on server' });
  }

  const sanitizedCompany = (appItem.company || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedRole = (appItem.role || 'SDE2').replace(/[^a-zA-Z0-9_-]/g, '_');
  const downloadName = `Santhosh_TK_${sanitizedCompany}_${sanitizedRole}_Resume.pdf`;

  res.download(pdfPath, downloadName);
});

app.delete('/api/applications/:id', (req, res) => {
  const { id } = req.params;
  let apps = getApplications();
  const appItem = apps.find(a => a.id === id);

  if (appItem && appItem.pdfFilename) {
    const pdfPath = path.join(UPLOADS_DIR, appItem.pdfFilename);
    if (fs.existsSync(pdfPath)) {
      try { fs.unlinkSync(pdfPath); } catch (e) {}
    }
  }

  apps = apps.filter(a => a.id !== id);
  saveApplications(apps);

  res.json({ success: true });
});

// --- SERVE PRODUCTION CLIENT ASSETS ---
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[INFO] Cold Email Backend listening on http://localhost:${PORT}`);
});
