/**
 * OUTREACH DEDUPLICATION SERVICE & SENT HR AUDIT REGISTRY
 * 
 * Strictly prevents sending duplicate cold emails to the same HR multiple times.
 * Maintains a persistent log (sent_hr_registry.json) for every contacted recruiter.
 * Before sending any email, it queries the log:
 * - If already sent: strictly blocks sending again with clear reason & date.
 * - If not sent: permits sending, and immediately records the send in the log.
 */

const fs = require('fs');
const path = require('path');
const { getUserLogs, getUserPaths, getUserBaseDir } = require('./user.service');

/**
 * Normalizes an email address for robust comparison
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Normalizes a career page or job URL (stripping tracking queries like utm_*, ref, etc.)
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'gh_src', 'source'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch (e) {
    return url.trim().toLowerCase().split('?')[0].replace(/\/+$/, '');
  }
}

/**
 * Normalizes company name
 */
function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves the path to the global HR outreach registry file
 */
function getGlobalRegistryPath() {
  const baseDir = typeof getUserBaseDir === 'function' ? getUserBaseDir() : path.join(__dirname, '../../users');
  if (!fs.existsSync(baseDir)) {
    try { fs.mkdirSync(baseDir, { recursive: true }); } catch (e) {}
  }
  return path.join(baseDir, 'global_sent_hr_registry.json');
}

/**
 * Retrieves the complete registry of all HRs already contacted.
 * Combines user-level sent_hr_registry.json, global registry, and activity logs.
 * 
 * @param {string} userKey - User sandbox key
 * @returns {Array<object>}
 */
function getSentHrRegistry(userKey) {
  const registryMap = new Map();

  const addRecord = (rec) => {
    if (!rec) return;
    const email = normalizeEmail(rec.email || rec.hrEmail);
    if (!email) return;
    if (!registryMap.has(email)) {
      registryMap.set(email, {
        email,
        hrName: rec.hrName || rec.name || 'HR Recruiter',
        company: rec.company || 'Company',
        subject: rec.subject || '',
        sentAt: rec.sentAt || rec.timestamp || new Date().toISOString(),
        messageId: rec.messageId || null,
        sourceUrl: rec.sourceUrl || rec.careerPageUrl || rec.jobUrl || ''
      });
    }
  };

  // 1. Read User Sandbox sent_hr_registry.json
  try {
    const paths = getUserPaths(userKey);
    const userRegistryPath = paths.sentHrRegistryPath || path.join(paths.userDir, 'sent_hr_registry.json');
    if (fs.existsSync(userRegistryPath)) {
      const content = fs.readFileSync(userRegistryPath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        data.forEach(addRecord);
      }
    }
  } catch (e) {}

  // 2. Read Global sent_hr_registry.json
  try {
    const globalPath = getGlobalRegistryPath();
    if (fs.existsSync(globalPath)) {
      const content = fs.readFileSync(globalPath, 'utf8');
      const globalData = JSON.parse(content);
      if (Array.isArray(globalData)) {
        globalData.forEach(addRecord);
      }
    }
  } catch (e) {}

  // 3. Merge with Activity Logs (Logs where status is Sent or Success)
  try {
    const logs = getUserLogs(userKey) || [];
    for (const log of logs) {
      const status = (log.status || '').toLowerCase();
      if (status.includes('sent') || status.includes('success')) {
        addRecord(log);
      }
    }
  } catch (e) {}

  return Array.from(registryMap.values());
}

/**
 * Immediately logs a newly contacted HR into the persistent registry files.
 * 
 * @param {string} userKey - User sandbox key
 * @param {object} contactData - { email, hrName, company, subject, messageId, sourceUrl, role }
 */
function recordSentHr(userKey, contactData = {}) {
  const email = normalizeEmail(contactData.email || contactData.hrEmail);
  if (!email) return;

  const record = {
    email,
    hrName: contactData.hrName || 'HR Recruiter',
    company: contactData.company || 'Company',
    subject: contactData.subject || '',
    sentAt: contactData.sentAt || new Date().toISOString(),
    timestamp: contactData.sentAt || new Date().toISOString(),
    messageId: contactData.messageId || null,
    sourceUrl: normalizeUrl(contactData.sourceUrl || contactData.careerPageUrl || contactData.jobUrl || ''),
    role: contactData.role || ''
  };

  // 1. Save to User Sandbox sent_hr_registry.json
  try {
    const paths = getUserPaths(userKey);
    if (!fs.existsSync(paths.userDir)) {
      fs.mkdirSync(paths.userDir, { recursive: true });
    }
    const userRegistryPath = paths.sentHrRegistryPath || path.join(paths.userDir, 'sent_hr_registry.json');
    let list = [];
    if (fs.existsSync(userRegistryPath)) {
      try {
        list = JSON.parse(fs.readFileSync(userRegistryPath, 'utf8'));
      } catch (e) {
        list = [];
      }
    }
    if (!list.some(item => normalizeEmail(item.email) === email)) {
      list.unshift(record);
      fs.writeFileSync(userRegistryPath, JSON.stringify(list, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[DEDUP LOG ERROR] Failed to save user HR registry:', err.message);
  }

  // 2. Save to Global Registry
  try {
    const globalPath = getGlobalRegistryPath();
    let globalList = [];
    if (fs.existsSync(globalPath)) {
      try {
        globalList = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
      } catch (e) {
        globalList = [];
      }
    }
    if (!globalList.some(item => normalizeEmail(item.email) === email)) {
      globalList.unshift(record);
      fs.writeFileSync(globalPath, JSON.stringify(globalList, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[DEDUP LOG ERROR] Failed to save global HR registry:', err.message);
  }
}

/**
 * Checks whether an outreach email has already been sent to this HR email address.
 * 
 * @param {string} userKey - User sandbox key
 * @param {string} email - HR recipient email
 * @returns {{ alreadySent: boolean, contact?: object, reason?: string }}
 */
function hasAlreadySentToHr(userKey, email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { alreadySent: false };

  const registry = getSentHrRegistry(userKey);
  const match = registry.find(r => normalizeEmail(r.email) === cleanEmail);

  if (match) {
    const sentDate = match.sentAt ? new Date(match.sentAt).toLocaleDateString('en-IN') : 'previously';
    return {
      alreadySent: true,
      contact: match,
      reason: `Duplicate HR Outreach Blocked: You have already sent an email to ${cleanEmail} (HR: ${match.hrName}, Company: ${match.company}) on ${sentDate}. Sending the same email to the same HR multiple times is strictly stopped.`
    };
  }

  return { alreadySent: false };
}

/**
 * Hard pre-send guard: Throws DUPLICATE_HR_EMAIL_BLOCKED if an email was already sent to this HR.
 */
function assertNotSentToHr(userKey, email, targetDetails = {}) {
  const check = hasAlreadySentToHr(userKey, email);
  if (check.alreadySent) {
    const err = new Error(check.reason);
    err.code = 'DUPLICATE_HR_EMAIL_BLOCKED';
    err.previousContact = check.contact;
    throw err;
  }
}

/**
 * Comprehensive check across email, career page URL, and company.
 * 
 * @param {string} userKey - User sandbox key
 * @param {object} target - { email, url, careerPageUrl, company, role }
 * @returns {{ alreadyContacted: boolean, reason?: string, previousContact?: object }}
 */
function isAlreadyContacted(userKey, target = {}) {
  const email = normalizeEmail(target.email || target.hrEmail);
  const cleanUrl = normalizeUrl(target.url || target.careerPageUrl || target.jobUrl || target.sourceUrl);
  const compKey = normalizeCompanyName(target.company);

  // 1. Check HR sent registry first
  if (email) {
    const hrCheck = hasAlreadySentToHr(userKey, email);
    if (hrCheck.alreadySent) {
      return {
        alreadyContacted: true,
        type: 'EMAIL_DUPLICATE',
        reason: hrCheck.reason,
        previousContact: hrCheck.contact
      };
    }
  }

  const logs = getUserLogs(userKey) || [];

  for (const log of logs) {
    const status = (log.status || '').toLowerCase();
    const isSent = status.includes('sent') || status.includes('success');
    if (!isSent) continue;

    const logEmail = normalizeEmail(log.hrEmail || log.email);
    const logUrl = normalizeUrl(log.sourceUrl || log.jobUrl || log.careerPageUrl || log.url);
    const logComp = normalizeCompanyName(log.company);

    // 2. Check exact email match in logs
    if (email && logEmail && email === logEmail) {
      const contactDate = log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-IN') : 'previously';
      return {
        alreadyContacted: true,
        type: 'EMAIL_DUPLICATE',
        reason: `Duplicate Email Prevented: An outreach email has already been sent to ${email} on ${contactDate}. Duplicate dispatch is blocked.`,
        previousContact: log
      };
    }

    // 3. Check career page / requisition URL match
    if (cleanUrl && logUrl && cleanUrl.length > 15 && cleanUrl === logUrl) {
      const contactDate = log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-IN') : 'previously';
      return {
        alreadyContacted: true,
        type: 'CAREER_PAGE_DUPLICATE',
        reason: `Duplicate Careers Page Prevented: An outreach email has already been sent for this careers page (${cleanUrl}) on ${contactDate}.`,
        previousContact: log
      };
    }

    // 4. Check exact company + generic email match
    const isGeneric = email.startsWith('careers@') || email.startsWith('jobs@') || email.startsWith('hr@') || email.startsWith('info@');
    if (isGeneric && compKey && logComp && compKey === logComp) {
      const contactDate = log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-IN') : 'previously';
      return {
        alreadyContacted: true,
        type: 'COMPANY_GENERIC_DUPLICATE',
        reason: `Duplicate Company Outreach Prevented: A cold email was already sent to ${log.company} (${log.email || email}) on ${contactDate}.`,
        previousContact: log
      };
    }
  }

  return { alreadyContacted: false };
}

/**
 * Throws an Error if outreach was already performed
 */
function assertNotAlreadyContacted(userKey, target = {}) {
  const check = isAlreadyContacted(userKey, target);
  if (check.alreadyContacted) {
    const err = new Error(check.reason);
    err.code = 'DUPLICATE_CONTACT_BLOCKED';
    err.duplicateType = check.type;
    err.previousContact = check.previousContact;
    throw err;
  }
}

module.exports = {
  normalizeEmail,
  normalizeUrl,
  normalizeCompanyName,
  getSentHrRegistry,
  recordSentHr,
  hasAlreadySentToHr,
  assertNotSentToHr,
  isAlreadyContacted,
  assertNotAlreadyContacted
};
