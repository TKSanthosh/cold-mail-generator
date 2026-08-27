const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { parseHrEmail } = require('./utils/parser');
const { getAuthUrl, handleCallbackCode, isAuthorized, logout } = require('./services/oauth.service');
const { generateColdEmail, tailorResume } = require('./services/llm.service');
const { generateResumePdf } = require('./services/pdf.service');
const { sendGmail } = require('./services/mail.service');

const app = express();
const PORT = process.env.PORT || 5000;
const RESUME_PATH = process.env.RESUME_PATH || path.join(__dirname, '../resume.json');
const LOGS_PATH = process.env.LOGS_PATH || path.join(__dirname, '../logs.json');

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json());

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

// --- GENERATION ENDPOINT ---
app.post('/api/generate', async (req, res) => {
  const { email, jd } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'HR Email address is required' });
  }

  try {
    const { name, company } = parseHrEmail(email);
    const standardResume = JSON.parse(fs.readFileSync(RESUME_PATH, 'utf8'));

    // Step 1: Generate Tailored Resume (if JD is provided)
    let tailoredResume = standardResume;
    if (jd && jd.trim().length > 0) {
      tailoredResume = await tailorResume(standardResume, jd);
    }

    // Step 2: Generate Cold Email Body
    const resumeSummary = tailoredResume.summary || standardResume.summary;
    const emailContent = await generateColdEmail(name, company, jd, resumeSummary);

    res.json({
      name,
      company,
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

  const tempPdfPath = path.join(UPLOADS_DIR, `Resume_${Date.now()}.pdf`);
  const parsedInfo = parseHrEmail(email);
  const targetName = hrName || parsedInfo.name;
  const targetCompany = company || parsedInfo.company;
  const isTailored = resumeType === 'Tailored' || !!(jdSnippet && jdSnippet.trim().length > 0);

  try {
    // Generate tailored PDF
    await generateResumePdf(resume, tempPdfPath);

    // Send via Gmail
    const result = await sendGmail(email, subject, body, tempPdfPath);

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
