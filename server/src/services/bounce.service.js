const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getUserPaths, getUserLogs, syncUserLogs, getUserOAuthClient } = require('./user.service');
const { getOAuth2Client, isAuthorized } = require('./oauth.service');

const GLOBAL_BOUNCE_FILE = path.join(__dirname, '../../data/global_bounces.json');

function ensureGlobalDataDir() {
  const dir = path.dirname(GLOBAL_BOUNCE_FILE);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
}

function getGlobalBounces() {
  ensureGlobalDataDir();
  if (fs.existsSync(GLOBAL_BOUNCE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(GLOBAL_BOUNCE_FILE, 'utf8')) || [];
    } catch (e) {}
  }
  return [];
}

function saveGlobalBounces(list) {
  ensureGlobalDataDir();
  try {
    fs.writeFileSync(GLOBAL_BOUNCE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {}
}

function getUserBounceFilePath(userKey) {
  if (userKey) {
    const userPaths = getUserPaths(userKey);
    return path.join(userPaths.userDir, 'bounces.json');
  }
  return GLOBAL_BOUNCE_FILE;
}

function getBouncedEmails(userKey = null) {
  const filePath = getUserBounceFilePath(userKey);
  let localBounces = [];
  if (fs.existsSync(filePath)) {
    try {
      localBounces = JSON.parse(fs.readFileSync(filePath, 'utf8')) || [];
    } catch (e) {}
  }

  const globalList = getGlobalBounces();
  const mergedMap = new Map();

  globalList.forEach(b => {
    if (b && b.email) mergedMap.set(b.email.toLowerCase().trim(), b);
  });
  localBounces.forEach(b => {
    if (b && b.email) mergedMap.set(b.email.toLowerCase().trim(), b);
  });

  return Array.from(mergedMap.values());
}

function isEmailBounced(email, userKey = null) {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const allBounces = getBouncedEmails(userKey);
  return allBounces.some(b => b.email && b.email.toLowerCase().trim() === clean);
}

function addBouncedEmail(userKey, email, reason = '550 Address not found / Mailbox unavailable', subject = '') {
  if (!email || !email.includes('@')) return;
  const cleanEmail = email.toLowerCase().trim();
  const now = new Date().toISOString();

  const record = {
    email: cleanEmail,
    reason: reason || 'Undeliverable bounce response',
    subject: subject || 'Cold Outreach Email',
    bouncedAt: now
  };

  // 1. Save to User Bounce list
  const filePath = getUserBounceFilePath(userKey);
  let userBounces = [];
  if (fs.existsSync(filePath)) {
    try { userBounces = JSON.parse(fs.readFileSync(filePath, 'utf8')) || []; } catch (e) {}
  }
  if (!userBounces.some(b => b.email.toLowerCase() === cleanEmail)) {
    userBounces.push(record);
    try { fs.writeFileSync(filePath, JSON.stringify(userBounces, null, 2), 'utf8'); } catch (e) {}
  }

  // 2. Save to Global Blacklist
  const globalList = getGlobalBounces();
  if (!globalList.some(b => b.email.toLowerCase() === cleanEmail)) {
    globalList.push(record);
    saveGlobalBounces(globalList);
  }

  // 3. Auto-update matching user outreach logs
  if (userKey) {
    try {
      const logs = getUserLogs(userKey);
      let updated = false;
      logs.forEach(l => {
        const logEm = (l.hrEmail || l.email || '').toLowerCase().trim();
        if (logEm === cleanEmail && !(l.status || '').includes('Bounced')) {
          l.status = `⚠️ Bounced (Undeliverable: ${reason.slice(0, 45)})`;
          l.bouncedAt = now;
          l.isBounced = true;
          updated = true;
        }
      });
      if (updated) {
        syncUserLogs(userKey, logs);
      }
    } catch (e) {}
  }
}

function clearBounces(userKey = null) {
  const filePath = getUserBounceFilePath(userKey);
  if (fs.existsSync(filePath)) {
    try { fs.writeFileSync(filePath, '[]', 'utf8'); } catch (e) {}
  }
}

/**
 * Extracts bounced recipient email from Gmail MIME headers or body text
 */
function extractBouncedEmailFromMessage(messageData) {
  const headers = messageData.payload?.headers || [];
  
  // Check header X-Failed-Recipients
  const failedHeader = headers.find(h => h.name.toLowerCase() === 'x-failed-recipients');
  if (failedHeader && failedHeader.value) {
    const match = failedHeader.value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (match) return match[1].toLowerCase().trim();
  }

  // Check subject and snippet
  const snippet = messageData.snippet || '';
  let fullBody = snippet;

  // Traverse MIME parts for plain text
  function collectBody(part) {
    if (!part) return;
    if (part.body?.data) {
      try {
        const decoded = Buffer.from(part.body.data, 'base64').toString('utf8');
        fullBody += '\n' + decoded;
      } catch (e) {}
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(collectBody);
    }
  }
  collectBody(messageData.payload);

  // Common bounce patterns
  const patterns = [
    /Final-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Original-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>:\s*(?:550|551|552|553|554|User unknown|Address not found)/i,
    /The email account that you tried to reach does not exist.*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /Your message to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+couldn't be delivered/i,
    /Delivery to the following recipient failed permanently:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+was not found at/i
  ];

  for (const regex of patterns) {
    const match = fullBody.match(regex);
    if (match && match[1] && !match[1].includes('mailer-daemon') && !match[1].includes('googlemail')) {
      return match[1].toLowerCase().trim();
    }
  }

  // Generic email match in snippet excluding sender
  const matches = snippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
  const valid = matches.find(e => !e.includes('mailer-daemon') && !e.includes('googlemail') && !e.includes('gmail.com'));
  return valid ? valid.toLowerCase().trim() : null;
}

/**
 * Scans user's Gmail inbox for bounce and failure notifications,
 * extracts failed addresses, blacklists them, and updates past logs.
 */
async function scanGmailBounces(userKey) {
  let oauth2Client;
  if (userKey) {
    oauth2Client = getUserOAuthClient(userKey);
  } else {
    oauth2Client = getOAuth2Client();
  }

  if (!oauth2Client) {
    return { error: 'Gmail client not authorized' };
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    // Search for delivery failures in the user's mailbox
    const query = 'from:mailer-daemon OR from:"Mail Delivery Subsystem" OR subject:"Delivery Status Notification" OR subject:"Undeliverable" OR subject:"Message not delivered"';
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages = listRes.data.messages || [];
    let newBouncesCount = 0;
    const detectedBounces = [];

    for (const msg of messages) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const bouncedEmail = extractBouncedEmailFromMessage(msgRes.data);
        if (bouncedEmail) {
          const subject = msgRes.data.payload?.headers?.find(h => h.name.toLowerCase() === 'subject')?.value || 'Delivery Failure';
          const reason = '550 5.1.1 Address not found (Undeliverable)';

          if (!isEmailBounced(bouncedEmail, userKey)) {
            newBouncesCount++;
          }

          addBouncedEmail(userKey, bouncedEmail, reason, subject);
          detectedBounces.push({ email: bouncedEmail, reason, subject });
        }
      } catch (err) {
        console.warn('[BOUNCE PARSE WARN]', err.message);
      }
    }

    const allBounces = getBouncedEmails(userKey);

    return {
      success: true,
      scannedMessages: messages.length,
      newBouncesDetected: newBouncesCount,
      totalBlacklisted: allBounces.length,
      bounces: allBounces
    };
  } catch (err) {
    console.error('[GMAIL BOUNCE SCAN ERROR]', err.message);
    return {
      success: false,
      error: err.message,
      totalBlacklisted: getBouncedEmails(userKey).length
    };
  }
}

module.exports = {
  getBouncedEmails,
  isEmailBounced,
  addBouncedEmail,
  clearBounces,
  scanGmailBounces,
  extractBouncedEmailFromMessage
};
