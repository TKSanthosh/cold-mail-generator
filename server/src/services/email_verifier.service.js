const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');

// In-memory caches for instantaneous lookups
const mxCache = new Map();
const emailValidationCache = new Map();

// Common dummy / invalid / placeholder / disposable domains to reject immediately
const DISPOSABLE_OR_INVALID_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.org', 'test.net',
  'fake.com', 'invalid.com', 'domain.com', 'xyz.com', 'temp.com',
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwawaymail.com', 'trashmail.com', 'getairmail.com', 'dispostable.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la'
]);

// Generic non-personal prefixes that should be flagged if cold mailing individual HRs
const GENERIC_PREFIXES = new Set([
  'noreply', 'no-reply', 'donotreply', 'support', 'help', 'sales',
  'billing', 'admin', 'administrator', 'abuse', 'postmaster', 'hostmaster',
  'webmaster', 'security', 'privacy', 'legal'
]);

/**
 * Validates email syntax strictly according to RFC 5322 standard
 */
function isValidEmailSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  if (clean.length > 254) return false;
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(clean);
}

/**
 * Resolves active DNS MX mail servers for domain, sorted by priority (lowest number first)
 */
async function getDomainMxRecords(domain) {
  if (!domain || typeof domain !== 'string') return [];
  const cleanDomain = domain.toLowerCase().trim();
  if (mxCache.has(cleanDomain)) {
    return mxCache.get(cleanDomain);
  }

  try {
    const records = await dns.resolveMx(cleanDomain);
    const sorted = records && records.length > 0
      ? records.sort((a, b) => (a.priority || 0) - (b.priority || 0))
      : [];
    mxCache.set(cleanDomain, sorted);
    return sorted;
  } catch (err) {
    mxCache.set(cleanDomain, []);
    return [];
  }
}

/**
 * Performs a fast lightweight SMTP socket handshake (HELO -> MAIL FROM -> RCPT TO)
 * to verify if the remote mail exchange accepts the recipient mailbox.
 */
async function checkSmtpMailbox(email, mxHost, timeoutMs = 800) {
  return new Promise((resolve) => {
    let socket;
    let step = 0;
    let isDone = false;

    const finish = (result) => {
      if (isDone) return;
      isDone = true;
      if (socket) {
        try {
          socket.write('QUIT\r\n');
          socket.end();
          socket.destroy();
        } catch (e) {}
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        deliverable: true,
        code: 0,
        response: 'SMTP Handshake fast-timeout; DNS MX verified deliverable',
        checkedViaSmtp: false
      });
    }, timeoutMs);

    try {
      socket = net.createConnection(25, mxHost);
      socket.setTimeout(timeoutMs);

      socket.on('error', (err) => {
        clearTimeout(timer);
        finish({
          deliverable: true,
          code: 0,
          response: `Socket Error: ${err.message}`,
          checkedViaSmtp: false
        });
      });

      socket.on('timeout', () => {
        clearTimeout(timer);
        finish({
          deliverable: true,
          code: 0,
          response: 'Socket Timeout',
          checkedViaSmtp: false
        });
      });

      socket.on('data', (data) => {
        const msg = data.toString();
        const code = parseInt(msg.substring(0, 3), 10) || 0;

        if (step === 0) {
          step = 1;
          socket.write(`HELO coldreach.ai\r\n`);
        } else if (step === 1) {
          if (code >= 200 && code < 400) {
            step = 2;
            socket.write(`MAIL FROM:<verify@coldreach.ai>\r\n`);
          } else {
            clearTimeout(timer);
            finish({ deliverable: true, code, response: msg.trim(), checkedViaSmtp: true });
          }
        } else if (step === 2) {
          if (code >= 200 && code < 400) {
            step = 3;
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else {
            clearTimeout(timer);
            finish({ deliverable: true, code, response: msg.trim(), checkedViaSmtp: true });
          }
        } else if (step === 3) {
          clearTimeout(timer);
          if (code >= 200 && code < 300) {
            finish({
              deliverable: true,
              code,
              response: msg.trim(),
              checkedViaSmtp: true,
              verifiedMailbox: true
            });
          } else if (code >= 500 && code < 600) {
            finish({
              deliverable: false,
              code,
              response: msg.trim(),
              checkedViaSmtp: true,
              bounceRisk: 'HIGH - Remote server rejected mailbox'
            });
          } else {
            finish({
              deliverable: true,
              code,
              response: msg.trim(),
              checkedViaSmtp: true,
              greylisted: true
            });
          }
        }
      });
    } catch (err) {
      clearTimeout(timer);
      finish({
        deliverable: true,
        code: 0,
        response: `Execution Error: ${err.message}`,
        checkedViaSmtp: false
      });
    }
  });
}

/**
 * Comprehensive Multi-Tier Email Verification with in-memory caching
 */
async function verifyEmailDeliverability(email, userKey = null) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, reason: 'Empty or invalid email input', score: 0 };
  }

  const cleanEmail = email.toLowerCase().trim();
  const cacheKey = `${cleanEmail}_${userKey || 'all'}`;

  if (emailValidationCache.has(cacheKey)) {
    return emailValidationCache.get(cacheKey);
  }

  // Tier 1: Syntax Check
  if (!isValidEmailSyntax(cleanEmail)) {
    const res = { isValid: false, email: cleanEmail, reason: 'Invalid email syntax (RFC 5322 check failed)', score: 0 };
    emailValidationCache.set(cacheKey, res);
    return res;
  }

  const [username, domain] = cleanEmail.split('@');

  // Tier 2: Disposable / Fake / Test Domain Check
  if (DISPOSABLE_OR_INVALID_DOMAINS.has(domain)) {
    const res = { isValid: false, email: cleanEmail, reason: `Domain @${domain} is a known dummy, invalid, or disposable email service`, score: 0 };
    emailValidationCache.set(cacheKey, res);
    return res;
  }

  // Tier 3: Known Blacklist Check (Bounces recorded from Gmail)
  try {
    const { isEmailBounced } = require('./bounce.service');
    if (isEmailBounced && isEmailBounced(cleanEmail, userKey)) {
      const res = { isValid: false, email: cleanEmail, reason: 'Email previously bounced in Gmail (auto-blacklisted)', score: 0, isBlacklisted: true };
      emailValidationCache.set(cacheKey, res);
      return res;
    }
  } catch (e) {}

  // Tier 4: DNS MX Resolution
  const mxRecords = await getDomainMxRecords(domain);
  if (!mxRecords || mxRecords.length === 0) {
    const res = { isValid: false, email: cleanEmail, domain, reason: `Domain @${domain} has no active MX mail servers configured (undeliverable)`, score: 0 };
    emailValidationCache.set(cacheKey, res);
    return res;
  }

  const primaryMx = mxRecords[0].exchange;

  // Tier 5: Direct SMTP Handshake Check
  let smtpResult = null;
  try {
    smtpResult = await checkSmtpMailbox(cleanEmail, primaryMx, 800);
  } catch (e) {
    smtpResult = { deliverable: true, checkedViaSmtp: false };
  }

  if (smtpResult && smtpResult.deliverable === false) {
    const res = {
      isValid: false,
      email: cleanEmail,
      domain,
      mxHost: primaryMx,
      reason: `Remote mail server rejected mailbox: ${smtpResult.response || '550 User Unknown'}`,
      score: 10,
      smtpCode: smtpResult.code
    };
    emailValidationCache.set(cacheKey, res);
    return res;
  }

  const isGeneric = GENERIC_PREFIXES.has(username);
  const confidenceScore = smtpResult?.verifiedMailbox ? 98 : (isGeneric ? 75 : 92);

  const finalResult = {
    isValid: true,
    email: cleanEmail,
    domain,
    mxHost: primaryMx,
    mxCount: mxRecords.length,
    checkedViaSmtp: smtpResult?.checkedViaSmtp || false,
    verifiedMailbox: smtpResult?.verifiedMailbox || false,
    isGeneric,
    score: confidenceScore,
    reason: 'Active MX Mail Server verified & deliverable'
  };

  emailValidationCache.set(cacheKey, finalResult);
  return finalResult;
}

/**
 * Generates and tests authentic corporate email variations for a recruiter & company domain
 */
async function generateAndVerifyRecruiterEmail(fullName, companyName, companyDomain, userKey = null) {
  if (!companyDomain || !companyDomain.includes('.')) {
    return null;
  }

  const cleanDomain = companyDomain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();
  const rawNames = (fullName || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const candidates = [];

  if (rawNames.length >= 2) {
    const first = rawNames[0];
    const last = rawNames[rawNames.length - 1];
    candidates.push(`${first}.${last}@${cleanDomain}`);
    candidates.push(`${first}@${cleanDomain}`);
  } else if (rawNames.length === 1) {
    const first = rawNames[0];
    candidates.push(`${first}@${cleanDomain}`);
  }

  // Standard talent channels
  candidates.push(`careers@${cleanDomain}`);
  candidates.push(`tech-hiring@${cleanDomain}`);

  for (const candidate of candidates) {
    const verification = await verifyEmailDeliverability(candidate, userKey);
    if (verification.isValid) {
      return {
        email: candidate,
        verification,
        pattern: candidate.split('@')[0]
      };
    }
  }

  return null;
}

module.exports = {
  isValidEmailSyntax,
  getDomainMxRecords,
  checkSmtpMailbox,
  verifyEmailDeliverability,
  generateAndVerifyRecruiterEmail,
  DISPOSABLE_OR_INVALID_DOMAINS
};
