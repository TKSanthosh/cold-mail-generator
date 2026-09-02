let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}
const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { resolveUserResumeFile } = require('./resume.service');
const { getUserResume, getUserResumeAsync, getUserPaths, ensureUserSandbox, addUserLog, getAllUserKeys, hydrateUserSandboxFromDatabase } = require('./user.service');
const {
  isSupabaseConfigured,
  supabaseSaveNaukriConfig,
  supabaseGetNaukriConfig,
  supabaseAppendNaukriHistory,
  supabaseGetNaukriHistory,
  supabaseGetAllUsers,
  supabaseAcquireLock,
  supabaseReleaseLock,
  supabaseIsLocked
} = require('./supabase.service');

const USERS_DIR = path.join(__dirname, '../../users');
const activeOtpSessions = new Map();

// --- DISTRIBUTED CONCURRENCY LOCK MANAGER (Supabase Lease + Local Fallback) ---
const userLocks = new Map();
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes auto-release for crash recovery

async function isUserLockedAsync(userKey = 'default_user') {
  if (isSupabaseConfigured()) {
    try {
      const dbLocked = await supabaseIsLocked(userKey);
      if (dbLocked) return true;
    } catch (e) {}
  }
  if (userLocks.has(userKey)) {
    const lock = userLocks.get(userKey);
    if (Date.now() - lock.lockedAt < LOCK_TIMEOUT_MS) {
      return true;
    }
    userLocks.delete(userKey);
  }
  return false;
}

function isUserLocked(userKey = 'default_user') {
  if (userLocks.has(userKey)) {
    const lock = userLocks.get(userKey);
    if (Date.now() - lock.lockedAt < LOCK_TIMEOUT_MS) {
      return true;
    }
    userLocks.delete(userKey);
  }
  return false;
}

async function acquireUserLockAsync(userKey = 'default_user', owner = `worker_${process.pid}_${Date.now()}`) {
  if (isSupabaseConfigured()) {
    try {
      const acquired = await supabaseAcquireLock(userKey, owner, 300);
      if (!acquired) return false;
    } catch (e) {}
  }
  if (userLocks.has(userKey)) {
    const lock = userLocks.get(userKey);
    if (Date.now() - lock.lockedAt < LOCK_TIMEOUT_MS) {
      return false;
    }
  }
  userLocks.set(userKey, {
    lockedAt: Date.now(),
    owner
  });
  logStructured('LOCK', `Acquired exclusive automation lease lock for user "${userKey}" (Owner: ${owner})`);
  return true;
}

function acquireUserLock(userKey = 'default_user', owner = `worker_${process.pid}_${Date.now()}`) {
  if (isUserLocked(userKey)) {
    return false;
  }
  userLocks.set(userKey, {
    lockedAt: Date.now(),
    owner
  });
  logStructured('LOCK', `Acquired exclusive automation lock for user "${userKey}" (Owner: ${owner})`);
  return true;
}

async function releaseUserLockAsync(userKey = 'default_user', owner = null) {
  if (isSupabaseConfigured()) {
    try {
      await supabaseReleaseLock(userKey, owner);
    } catch (e) {}
  }
  if (userLocks.has(userKey)) {
    userLocks.delete(userKey);
    logStructured('LOCK', `Released automation lock for user "${userKey}"`);
  }
  return true;
}

function releaseUserLock(userKey = 'default_user') {
  if (userLocks.has(userKey)) {
    userLocks.delete(userKey);
    logStructured('LOCK', `Released automation lock for user "${userKey}"`);
  }
}

// --- STRUCTURED NON-LEAKING OBSERVABILITY LOGGER ---
function logStructured(tag, message, meta = null) {
  let cleanMsg = message;
  if (typeof cleanMsg === 'string') {
    cleanMsg = cleanMsg
      .replace(/password[:=]\s*["']?[^"'\s,]+["']?/gi, 'password=[REDACTED]')
      .replace(/nauk_session=[^;\s,]+/gi, 'nauk_session=[REDACTED]')
      .replace(/ubt_user=[^;\s,]+/gi, 'ubt_user=[REDACTED]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  }
  console.log(`[${tag.toUpperCase()}] ${cleanMsg}`);
}

const IST_OFFSET_MINUTES = 330; // Indian Standard Time (UTC+5:30)

function getIstTime(date = new Date()) {
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(),
    date: istDate.getUTCDate(),
    hours: istDate.getUTCHours(),
    minutes: istDate.getUTCMinutes(),
    seconds: istDate.getUTCSeconds(),
    totalMinutes: istDate.getUTCHours() * 60 + istDate.getUTCMinutes()
  };
}

function createDateFromIst(year, month, date, targetHour, targetMinute) {
  const utcMillis = Date.UTC(year, month, date, targetHour, targetMinute, 0, 0) - (IST_OFFSET_MINUTES * 60 * 1000);
  return new Date(utcMillis);
}

/**
 * Calculates the next Quarter-Day schedule slot (10:00 AM, 04:00 PM, 10:00 PM, 04:00 AM IST)
 */
function getNextQuarterDayTime(baseDate = new Date()) {
  const istNow = getIstTime(baseDate);
  const slots = [
    { hour: 4, minute: 0 },
    { hour: 10, minute: 0 },
    { hour: 16, minute: 0 },
    { hour: 22, minute: 0 }
  ];

  for (const s of slots) {
    const candidate = createDateFromIst(istNow.year, istNow.month, istNow.date, s.hour, s.minute);
    if (candidate > baseDate) {
      return candidate;
    }
  }

  return createDateFromIst(istNow.year, istNow.month, istNow.date + 1, slots[0].hour, slots[0].minute);
}

/**
 * Calculates the next schedule slot based on config (Quarter-Day, Hourly, Half-Hour, or Custom Timings) in IST
 */
function calculateNextUploadTime(config = {}, baseDate = new Date()) {
  const scheduleMode = config.scheduleMode || 'quarter_day';

  if (scheduleMode === 'half_hour') {
    return new Date(baseDate.getTime() + 30 * 60 * 1000);
  }

  if (scheduleMode === 'hourly') {
    const mins = config.intervalMinutes || 60;
    return new Date(baseDate.getTime() + mins * 60 * 1000);
  }

  const istNow = getIstTime(baseDate);

  if (scheduleMode === 'custom') {
    const rawSlots = Array.isArray(config.customSlots) && config.customSlots.length > 0
      ? config.customSlots
      : ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'];

    const parsedSlots = [];
    for (const slot of rawSlots) {
      if (!slot || typeof slot !== 'string') continue;
      const str = slot.trim().toUpperCase();
      let hour = 0;
      let minute = 0;

      if (str.includes('AM') || str.includes('PM')) {
        const isPM = str.includes('PM');
        const clean = str.replace(/AM|PM/g, '').trim();
        const parts = clean.split(':').map(n => parseInt(n, 10) || 0);
        hour = parts[0] || 0;
        minute = parts[1] || 0;
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
      } else if (str.includes(':')) {
        const parts = str.split(':').map(n => parseInt(n, 10) || 0);
        hour = parts[0] || 0;
        minute = parts[1] || 0;
      } else {
        hour = parseInt(str, 10) || 0;
      }

      parsedSlots.push({ hour, minute, totalMins: hour * 60 + minute, original: slot });
    }

    parsedSlots.sort((a, b) => a.totalMins - b.totalMins);

    // Check next slot today in IST
    for (const s of parsedSlots) {
      const candidate = createDateFromIst(istNow.year, istNow.month, istNow.date, s.hour, s.minute);
      if (candidate > baseDate) {
        return candidate;
      }
    }

    // Wrap around to first slot tomorrow in IST
    if (parsedSlots.length > 0) {
      return createDateFromIst(istNow.year, istNow.month, istNow.date + 1, parsedSlots[0].hour, parsedSlots[0].minute);
    }
  }

  return getNextQuarterDayTime(baseDate);
}

/**
 * Recursively scans directory for chrome/chromium executable
 */
function findChromeInDirectory(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findChromeInDirectory(fullPath);
        if (found) return found;
      } else if (
        entry === 'chrome' ||
        entry === 'chrome.exe' ||
        entry === 'chromium' ||
        entry === 'msedge.exe' ||
        entry === 'google-chrome-stable'
      ) {
        // Ensure it is executable on Linux
        if (process.platform !== 'win32') {
          try { fs.chmodSync(fullPath, 0o755); } catch (e) {}
        }
        return fullPath;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Automatically discovers Google Chrome or Microsoft Edge across Windows & Linux (Render / Docker)
 */
function findBrowserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (process.env.GOOGLE_CHROME_BIN && fs.existsSync(process.env.GOOGLE_CHROME_BIN)) {
    return process.env.GOOGLE_CHROME_BIN;
  }

  // 1. Windows standard paths
  if (process.platform === 'win32') {
    const winCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);

    for (const p of winCandidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 2. Linux / Render / Docker standard binary paths
  const linuxCandidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/lib/chromium/chrome',
    '/app/.apt/usr/bin/google-chrome'
  ];
  for (const p of linuxCandidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Search all possible Puppeteer cache directories (Render & local)
  const cacheDirs = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(process.cwd(), '.cache/puppeteer'),
    path.join(process.cwd(), 'server/.cache/puppeteer'),
    path.join(__dirname, '../../.cache/puppeteer'),
    path.join(__dirname, '../../../.cache/puppeteer'),
    path.join(__dirname, '../.cache/puppeteer'),
    '/opt/render/project/src/.cache/puppeteer',
    '/opt/render/project/src/server/.cache/puppeteer',
    '/opt/render/.cache/puppeteer',
    '/root/.cache/puppeteer',
    process.env.HOME ? path.join(process.env.HOME, '.cache/puppeteer') : null
  ].filter(Boolean);

  for (const cDir of cacheDirs) {
    const found = findChromeInDirectory(cDir);
    if (found) return found;
  }

  // 4. Bundled Puppeteer browser executable if present
  try {
    if (puppeteer && typeof puppeteer.executablePath === 'function') {
      const pPath = puppeteer.executablePath();
      if (pPath && fs.existsSync(pPath)) return pPath;
    }
  } catch (e) {}

  return null;
}

/**
 * Ensures Chrome is installed, attempting on-demand download if missing on Linux
 */
async function ensureBrowserInstalled() {
  let executable = findBrowserExecutable();
  if (executable) return executable;

  if (process.platform !== 'win32') {
    try {
      const browsers = require('@puppeteer/browsers');
      let buildId = '121.0.6167.85';
      try {
        const { PUPPETEER_REVISIONS } = require('puppeteer-core/internal/revisions.js');
        if (PUPPETEER_REVISIONS && PUPPETEER_REVISIONS.chrome) {
          buildId = PUPPETEER_REVISIONS.chrome;
        }
      } catch (e) {}

      const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '../../../.cache/puppeteer');
      try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}

      console.log(`[BROWSER DISCOVERY] Chrome missing on Linux. Downloading Chrome build (${buildId}) into: ${cacheDir}...`);
      const installed = await browsers.install({
        browser: browsers.Browser.CHROME,
        buildId: buildId,
        cacheDir: cacheDir
      });

      console.log(`[BROWSER DISCOVERY] Chrome installed successfully at: ${installed.executablePath}`);
      if (process.platform !== 'win32') {
        try { fs.chmodSync(installed.executablePath, 0o755); } catch (e) {}
      }
      return installed.executablePath;
    } catch (err) {
      console.warn('[BROWSER DISCOVERY] Programmatic browser install notice:', err.message);
    }
  }

  return findBrowserExecutable();
}

function hasValidNaukriSession(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriSessionPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(paths.naukriSessionPath, 'utf8'));
      return Array.isArray(cookies) && cookies.length > 0;
    } catch (e) {}
  }
  return false;
}

function sanitizeCookieObj(c) {
  if (!c || !c.name || !c.value) return null;
  const rawDomain = (c.domain || '.naukri.com').trim();
  const cookie = {
    name: String(c.name).trim(),
    value: String(c.value).trim(),
    domain: rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`,
    path: c.path ? String(c.path).trim() : '/'
  };

  const rawExp = c.expires !== undefined ? c.expires : c.expirationDate;
  if (rawExp !== undefined && rawExp !== null && !isNaN(Number(rawExp))) {
    let numExp = Number(rawExp);
    if (numExp > 100000000000) { // Milliseconds epoch timestamp -> convert to seconds
      numExp = Math.floor(numExp / 1000);
    }
    if (numExp > 0) {
      cookie.expires = numExp;
    }
  }

  if (typeof c.httpOnly === 'boolean') {
    cookie.httpOnly = c.httpOnly;
  }
  if (typeof c.secure === 'boolean') {
    cookie.secure = c.secure;
  }
  if (c.sameSite) {
    const s = String(c.sameSite).toLowerCase();
    if (s === 'strict') cookie.sameSite = 'Strict';
    else if (s === 'lax') cookie.sameSite = 'Lax';
    else if (s === 'none' || s === 'no_restriction') cookie.sameSite = 'None';
  }

  return cookie;
}

function parseCookieInput(cookieInput) {
  let cookiesToSave = [];

  if (Array.isArray(cookieInput)) {
    cookiesToSave = cookieInput.map(sanitizeCookieObj).filter(Boolean);
  } else if (typeof cookieInput === 'string') {
    let cleanInput = cookieInput.trim();

    if (cleanInput.toLowerCase().startsWith('cookie:')) {
      cleanInput = cleanInput.substring(7).trim();
    }
    if (cleanInput.toLowerCase().startsWith('-h "cookie:') || cleanInput.toLowerCase().startsWith("-h 'cookie:")) {
      cleanInput = cleanInput.replace(/^-h\s+['"]cookie:\s*/i, '').replace(/['"]$/, '').trim();
    }

    if (cleanInput.startsWith('[') || cleanInput.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanInput);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        cookiesToSave = arr.map(sanitizeCookieObj).filter(Boolean);
      } catch (e) {}
    }

    if (cookiesToSave.length === 0 && cleanInput.includes('=')) {
      const parts = cleanInput.split(';');
      const firstPart = parts[0].trim();
      const firstEq = firstPart.indexOf('=');

      // Check if this is a single Set-Cookie string with directives (Path, Domain, Expires, Secure, HttpOnly, SameSite)
      const hasDirective = parts.slice(1).some(p => {
        const lower = p.trim().toLowerCase();
        return lower.startsWith('domain=') || lower.startsWith('path=') || lower.startsWith('expires=') || lower === 'secure' || lower === 'httponly' || lower.startsWith('samesite=');
      });

      if (hasDirective && firstEq !== -1) {
        const cookie = {
          name: firstPart.substring(0, firstEq).trim(),
          value: firstPart.substring(firstEq + 1).trim(),
          domain: '.naukri.com',
          path: '/'
        };
        for (let i = 1; i < parts.length; i++) {
          const attr = parts[i].trim();
          const attrLower = attr.toLowerCase();
          if (attrLower.startsWith('domain=')) {
            const d = attr.substring(7).trim();
            cookie.domain = d.startsWith('.') ? d : `.${d}`;
          } else if (attrLower.startsWith('path=')) {
            cookie.path = attr.substring(5).trim();
          } else if (attrLower.startsWith('expires=')) {
            const expDate = new Date(attr.substring(8).trim());
            if (!isNaN(expDate.getTime())) {
              cookie.expires = Math.floor(expDate.getTime() / 1000);
            }
          } else if (attrLower === 'httponly') {
            cookie.httpOnly = true;
          } else if (attrLower === 'secure') {
            cookie.secure = true;
          } else if (attrLower.startsWith('samesite=')) {
            const s = attr.substring(9).trim().toLowerCase();
            if (s === 'strict') cookie.sameSite = 'Strict';
            else if (s === 'lax') cookie.sameSite = 'Lax';
            else if (s === 'none' || s === 'no_restriction') cookie.sameSite = 'None';
          }
        }
        cookiesToSave.push(cookie);
      } else {
        // Standard multi-cookie header "name1=val1; name2=val2"
        for (const pair of parts) {
          const idx = pair.indexOf('=');
          if (idx !== -1) {
            const k = pair.substring(0, idx).trim();
            const v = pair.substring(idx + 1).trim();
            if (k && v) {
              cookiesToSave.push({
                name: k,
                value: v,
                domain: '.naukri.com',
                path: '/'
              });
            }
          }
        }
      }
    }

    if (cookiesToSave.length === 0 && cleanInput.length > 10 && !cleanInput.includes(' ') && !cleanInput.includes('\n')) {
      cookiesToSave.push({
        name: 'nauk_session',
        value: cleanInput,
        domain: '.naukri.com',
        path: '/'
      });
    }
  }

  return cookiesToSave;
}

async function saveNaukriSessionCookiesAsync(userKey = 'default_user', cookieInput, options = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const cookiesToSave = parseCookieInput(cookieInput);

  if (cookiesToSave.length > 0) {
    fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookiesToSave, null, 2), 'utf8');
    const config = getNaukriConfig(userKey);
    const newStatus = options.status || (config.sessionStatus === 'ACTIVE' ? 'ACTIVE' : 'CONFIGURED');
    config.hasSession = true;
    config.sessionStatus = newStatus;
    config.lastStatus = newStatus === 'ACTIVE' ? 'Active & Verified' : 'Session Configured (Pending Live Verification)';
    config.lastError = null;
    config.lastUpdatedAt = new Date().toISOString();
    if (newStatus === 'ACTIVE') {
      config.lastVerifiedAt = new Date().toISOString();
    }
    config.sessionCookies = cookiesToSave;
    fs.writeFileSync(paths.naukriConfigPath, JSON.stringify(config, null, 2), 'utf8');

    if (isSupabaseConfigured()) {
      try {
        await supabaseSaveNaukriConfig(userKey, {
          ...config,
          sessionCookies: cookiesToSave,
          hasSession: true,
          sessionStatus: newStatus,
          lastUpdatedAt: config.lastUpdatedAt,
          lastVerifiedAt: config.lastVerifiedAt,
          lastError: null
        });
      } catch (e) {
        console.warn('[SUPABASE] saveNaukriSessionCookiesAsync notice:', e.message);
      }
    }

    const hasNaukSession = cookiesToSave.some(c => c.name === 'nauk_session');

    appendNaukriHistory(userKey, {
      status: newStatus === 'ACTIVE' ? 'Session Refreshed' : 'Session Configured',
      detail: `Stored ${cookiesToSave.length} session cookies into Supabase database`,
      profileStatus: newStatus === 'ACTIVE' ? 'Active & Verified' : 'Session Configured - Ready for Verification'
    });

    logStructured('AUTH', `Successfully saved and persisted ${cookiesToSave.length} complete session cookies to Supabase DB for user "${userKey}"`);

    return {
      success: true,
      count: cookiesToSave.length,
      hasAuthToken: hasNaukSession,
      status: newStatus,
      lastVerifiedAt: config.lastVerifiedAt || null,
      lastUpdatedAt: config.lastUpdatedAt,
      message: `Successfully linked Naukri session (${cookiesToSave.length} cookies)! Supabase database is now configured.`
    };
  }

  throw new Error('Could not parse session cookies. Please copy the "cookie:" request header from Network tab or paste a JSON array / cookie string.');
}

function saveNaukriSessionCookies(userKey = 'default_user', cookieInput, options = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const cookiesToSave = parseCookieInput(cookieInput);

  if (cookiesToSave.length > 0) {
    fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookiesToSave, null, 2), 'utf8');
    const config = getNaukriConfig(userKey);
    const newStatus = options.status || (config.sessionStatus === 'ACTIVE' ? 'ACTIVE' : 'CONFIGURED');
    config.hasSession = true;
    config.sessionStatus = newStatus;
    config.lastStatus = newStatus === 'ACTIVE' ? 'Active & Verified' : 'Session Configured (Pending Live Verification)';
    config.lastError = null;
    config.lastUpdatedAt = new Date().toISOString();
    if (newStatus === 'ACTIVE') {
      config.lastVerifiedAt = new Date().toISOString();
    }
    config.sessionCookies = cookiesToSave;
    fs.writeFileSync(paths.naukriConfigPath, JSON.stringify(config, null, 2), 'utf8');

    if (isSupabaseConfigured()) {
      supabaseSaveNaukriConfig(userKey, {
        ...config,
        sessionCookies: cookiesToSave,
        hasSession: true,
        sessionStatus: newStatus,
        lastUpdatedAt: config.lastUpdatedAt,
        lastVerifiedAt: config.lastVerifiedAt,
        lastError: null
      }).catch(() => {});
    }

    const hasNaukSession = cookiesToSave.some(c => c.name === 'nauk_session');

    appendNaukriHistory(userKey, {
      status: newStatus === 'ACTIVE' ? 'Session Refreshed' : 'Session Configured',
      detail: `Stored ${cookiesToSave.length} session cookies into Supabase database`,
      profileStatus: newStatus === 'ACTIVE' ? 'Active & Verified' : 'Session Configured - Ready for Verification'
    });

    logStructured('AUTH', `Successfully saved and persisted ${cookiesToSave.length} complete session cookies to Supabase DB for user "${userKey}"`);

    return {
      success: true,
      count: cookiesToSave.length,
      hasAuthToken: hasNaukSession,
      status: newStatus,
      lastVerifiedAt: config.lastVerifiedAt || null,
      lastUpdatedAt: config.lastUpdatedAt,
      message: `Successfully linked Naukri session (${cookiesToSave.length} cookies)! Supabase database is now configured.`
    };
  }

  throw new Error('Could not parse session cookies. Please copy the "cookie:" request header from Network tab or paste a JSON array / cookie string.');
}

function getNaukriSessionCookies(userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriSessionPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(paths.naukriSessionPath, 'utf8'));
      if (Array.isArray(cookies) && cookies.length > 0) {
        return cookies;
      }
    } catch (e) {}
  }
  if (fs.existsSync(paths.naukriConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(paths.naukriConfigPath, 'utf8'));
      if (Array.isArray(saved.sessionCookies) && saved.sessionCookies.length > 0) {
        return saved.sessionCookies;
      }
    } catch (e) {}
  }
  return [];
}

async function clearNaukriSessionAsync(userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriSessionPath)) {
    try { fs.unlinkSync(paths.naukriSessionPath); } catch (e) {}
  }
  const config = getNaukriConfig(userKey);
  config.hasSession = false;
  config.sessionStatus = 'NOT_CONFIGURED';
  config.lastStatus = 'Session Disconnected';
  config.sessionCookies = [];
  config.lastUpdatedAt = new Date().toISOString();
  saveNaukriConfig(userKey, config);

  if (isSupabaseConfigured()) {
    try {
      await supabaseSaveNaukriConfig(userKey, { sessionCookies: [], hasSession: false, sessionStatus: 'NOT_CONFIGURED', lastUpdatedAt: config.lastUpdatedAt });
    } catch (e) {}
  }
  logStructured('AUTH', `Naukri session disconnected for user "${userKey}"`);
  return { success: true, message: 'Naukri session disconnected.' };
}

function clearNaukriSession(userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriSessionPath)) {
    try { fs.unlinkSync(paths.naukriSessionPath); } catch (e) {}
  }
  const config = getNaukriConfig(userKey);
  config.hasSession = false;
  config.sessionStatus = 'NOT_CONFIGURED';
  config.lastStatus = 'Session Disconnected';
  config.sessionCookies = [];
  config.lastUpdatedAt = new Date().toISOString();
  saveNaukriConfig(userKey, config);

  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, { sessionCookies: [], hasSession: false, sessionStatus: 'NOT_CONFIGURED', lastUpdatedAt: config.lastUpdatedAt }).catch(() => {});
  }
  logStructured('AUTH', `Naukri session disconnected for user "${userKey}"`);
  return { success: true, message: 'Naukri session disconnected.' };
}

/**
 * Restores and injects latest valid authentication state into Puppeteer page context.
 * Supabase Cloud DB is the authoritative source of truth.
 */
async function restoreAndInjectNaukriSession(page, userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  let cookies = [];
  let source = 'none';

  logStructured('AUTH', `Loading persisted Naukri session for user "${userKey}"...`);

  // 1. SUPABASE DATABASE IS AUTHORITATIVE SOURCE OF TRUTH (Crucial for Render container restarts)
  if (isSupabaseConfigured()) {
    try {
      const cloudConf = await supabaseGetNaukriConfig(userKey);
      if (cloudConf && Array.isArray(cloudConf.sessionCookies) && cloudConf.sessionCookies.length > 0) {
        cookies = cloudConf.sessionCookies;
        source = 'supabase_database';
        // Cache to local sandbox for session operations
        try { fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookies, null, 2), 'utf8'); } catch (e) {}
      }
    } catch (e) {
      console.warn('[AUTH WARNING] Supabase session retrieval notice:', e.message);
    }
  }

  // 2. Ephemeral Local Cache Fallback (only if Supabase unavailable)
  if ((!cookies || cookies.length === 0) && fs.existsSync(paths.naukriSessionPath)) {
    try {
      cookies = JSON.parse(fs.readFileSync(paths.naukriSessionPath, 'utf8'));
      if (Array.isArray(cookies) && cookies.length > 0) {
        source = 'local_sandbox_cache';
      }
    } catch (e) {}
  }

  if ((!cookies || cookies.length === 0) && fs.existsSync(paths.naukriConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(paths.naukriConfigPath, 'utf8'));
      if (Array.isArray(cfg.sessionCookies) && cfg.sessionCookies.length > 0) {
        cookies = cfg.sessionCookies;
        source = 'local_config_cache';
      }
    } catch (e) {}
  }

  if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
    logStructured('AUTH', `No persisted session cookies found in Supabase DB or cache for user "${userKey}"`);
    return { hasSession: false, count: 0, restored: false, source: 'none', status: 'NOT_CONFIGURED' };
  }

  logStructured('AUTH', `Session found (${cookies.length} cookies from ${source})`);
  logStructured('AUTH', `Restoring browser authentication...`);

  try {
    for (const c of cookies) {
      if (!c || !c.name || !c.value) continue;
      const dom = c.domain || '.naukri.com';
      const cookieObj = {
        name: String(c.name).trim(),
        value: String(c.value).trim(),
        domain: dom.startsWith('.') ? dom : `.${dom}`,
        path: c.path || '/'
      };
      if (c.expires !== undefined && c.expires !== null && !isNaN(Number(c.expires))) {
        cookieObj.expires = Number(c.expires);
      }
      if (typeof c.httpOnly === 'boolean') {
        cookieObj.httpOnly = c.httpOnly;
      }
      if (typeof c.secure === 'boolean') {
        cookieObj.secure = c.secure;
      }
      if (c.sameSite && ['Strict', 'Lax', 'None'].includes(c.sameSite)) {
        cookieObj.sameSite = c.sameSite;
      }

      try {
        await page.setCookie(cookieObj);
      } catch (err) {
        try {
          await page.setCookie({
            ...cookieObj,
            domain: 'www.naukri.com'
          });
        } catch (e2) {
          try {
            await page.setCookie({
              ...cookieObj,
              domain: 'naukri.com'
            });
          } catch (e3) {}
        }
      }
    }

    const browserCookies = await page.cookies().catch(() => []);
    if (!browserCookies || browserCookies.length === 0) {
      logStructured('AUTH', `Session restore failed for user "${userKey}": Browser context failed to accept cookies`);
      const config = getNaukriConfig(userKey);
      config.sessionStatus = 'AUTH_RESTORE_FAILED';
      config.lastError = 'Browser context failed to accept injected cookies (AUTH_RESTORE_FAILED)';
      saveNaukriConfig(userKey, config);
      return {
        hasSession: false,
        count: 0,
        restored: false,
        failureType: 'AUTH_RESTORE_FAILED',
        error: 'Browser context rejected cookie injection',
        source
      };
    }

    logStructured('AUTH', `Browser authentication restored (${browserCookies.length} cookies active)`);
    return { hasSession: true, count: browserCookies.length, restored: true, cookies, source };
  } catch (injectErr) {
    logStructured('AUTH', `Session restore failed for user "${userKey}": ${injectErr.message}`);
    const config = getNaukriConfig(userKey);
    config.sessionStatus = 'AUTH_RESTORE_FAILED';
    config.lastError = `Cookie injection error: ${injectErr.message}`;
    saveNaukriConfig(userKey, config);
    return {
      hasSession: false,
      count: 0,
      restored: false,
      failureType: 'AUTH_RESTORE_FAILED',
      error: injectErr.message,
      source
    };
  }
}

/**
 * Live Session Validation against Naukri servers
 * Navigates to Naukri and verifies if the session is actively authenticated without assuming cookie immortality.
 * If valid, refreshes and saves the latest session cookies in Supabase DB with status = "ACTIVE".
 * If invalid, halts automation and marks session expired.
 */
async function validateNaukriSessionOnPage(page, userKey = 'default_user') {
  logStructured('AUTH', `Validating Naukri session for user "${userKey}"...`);

  try {
    // 1. Warm up connection on root domain
    try {
      await page.goto('https://www.naukri.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await delay(1200);
    } catch (e) {}

    // 2. Navigate to candidate profile page
    logStructured('AUTH', 'Navigating to https://www.naukri.com/mnjuser/profile to verify authentication...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await delay(3000);

    // 3. Inspect page state
    const currentUrl = page.url();
    const pageTitle = (await page.title().catch(() => '')) || '';
    const pageBodyText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) || '';

    const isAccessDenied = pageTitle.toLowerCase().includes('access denied') ||
                           pageTitle.toLowerCase().includes('403') ||
                           pageBodyText.toLowerCase().includes('access denied') ||
                           pageBodyText.toLowerCase().includes("you don't have permission");

    const isLoginRedirect = currentUrl.includes('login') ||
                            currentUrl.includes('nlogin') ||
                            pageTitle.toLowerCase().includes('login') ||
                            pageTitle.toLowerCase().includes('jobseeker login') ||
                            isAccessDenied;

    if (isLoginRedirect) {
      logStructured('AUTH', `Naukri login redirect detected (URL: ${currentUrl}, Title: "${pageTitle}")`);
      logStructured('AUTH', `Session marked EXPIRED`);
      const reason = isAccessDenied ? 'Access Denied by Naukri' : 'Redirected to login page (Session expired on Naukri)';

      const config = getNaukriConfig(userKey);
      config.hasSession = false;
      config.sessionStatus = 'EXPIRED';
      config.lastStatus = 'SESSION EXPIRED (Authentication Required)';
      config.lastError = `Naukri session expired: ${reason}`;
      config.lastVerifiedAt = new Date().toISOString();
      config.lastUpdatedAt = new Date().toISOString();
      saveNaukriConfig(userKey, config);

      if (isSupabaseConfigured()) {
        supabaseSaveNaukriConfig(userKey, {
          hasSession: false,
          sessionStatus: 'EXPIRED',
          lastStatus: config.lastStatus,
          lastError: config.lastError,
          lastVerifiedAt: config.lastVerifiedAt,
          lastUpdatedAt: config.lastUpdatedAt
        }).catch(() => {});
      }

      appendNaukriHistory(userKey, {
        status: 'SESSION_EXPIRED',
        error: reason,
        profileStatus: 'Session Expired - Re-authentication Required'
      });

      return {
        authenticated: false,
        isValid: false,
        status: 'EXPIRED',
        reason: 'NAUKRI_LOGIN_REDIRECT',
        detail: reason,
        currentUrl,
        lastVerifiedAt: config.lastVerifiedAt
      };
    }

    // 4. Positive verification: Check for candidate profile markers in DOM
    const profileInfo = await page.evaluate(() => {
      const nameEl = document.querySelector('.user-name, .fullname, .user-details .name, .candidate-name, .nI-gNb-drawer__user-name, div[class*="user-name"], div[class*="candidateName"]');
      const candidateName = nameEl?.textContent?.trim() || '';
      const hasProfileHeader = !!document.querySelector('.profile-page-wrapper, .dashboard-wrapper, a[href*="mnjuser/profile"], .attachCV, input#attachCV, input[name="attachCV"]');
      return { candidateName, hasProfileHeader };
    });

    if (currentUrl.includes('mnjuser/profile') || profileInfo.hasProfileHeader || profileInfo.candidateName) {
      logStructured('AUTH', `Naukri session ACTIVE for candidate: "${profileInfo.candidateName || userKey}"`);

      // 5. Capture complete rolling refreshed cookies from Naukri and persist to Supabase DB & sandbox
      const latestCookies = await page.cookies().catch(() => []);
      if (Array.isArray(latestCookies) && latestCookies.length > 0) {
        saveNaukriSessionCookies(userKey, latestCookies, { status: 'ACTIVE' });
      }

      const config = getNaukriConfig(userKey);
      config.hasSession = true;
      config.sessionStatus = 'ACTIVE';
      config.lastVerifiedAt = new Date().toISOString();
      config.lastUpdatedAt = new Date().toISOString();
      config.lastStatus = 'Active & Verified';
      config.lastError = null;
      if (profileInfo.candidateName) config.candidateName = profileInfo.candidateName;
      saveNaukriConfig(userKey, config);

      if (isSupabaseConfigured()) {
        supabaseSaveNaukriConfig(userKey, {
          hasSession: true,
          sessionStatus: 'ACTIVE',
          lastStatus: config.lastStatus,
          lastVerifiedAt: config.lastVerifiedAt,
          lastUpdatedAt: config.lastUpdatedAt,
          candidateName: profileInfo.candidateName || null,
          lastError: null
        }).catch(() => {});
      }

      return {
        authenticated: true,
        isValid: true,
        status: 'ACTIVE',
        candidateName: profileInfo.candidateName || userKey,
        currentUrl,
        lastVerifiedAt: config.lastVerifiedAt
      };
    }

    // Check for login input fields on page
    const hasLoginInputs = await page.$('#usernameField, #login_email, input[placeholder*="Enter your active Email" i], input[type="password"]');
    if (hasLoginInputs) {
      logStructured('AUTH', 'Naukri login redirect detected (Login form present)');
      logStructured('AUTH', 'Session marked EXPIRED');
      const reason = 'Login form detected on page';

      const config = getNaukriConfig(userKey);
      config.hasSession = false;
      config.sessionStatus = 'EXPIRED';
      config.lastStatus = 'SESSION EXPIRED (Authentication Required)';
      config.lastError = reason;
      config.lastVerifiedAt = new Date().toISOString();
      config.lastUpdatedAt = new Date().toISOString();
      saveNaukriConfig(userKey, config);

      if (isSupabaseConfigured()) {
        supabaseSaveNaukriConfig(userKey, {
          hasSession: false,
          sessionStatus: 'EXPIRED',
          lastStatus: config.lastStatus,
          lastError: config.lastError,
          lastVerifiedAt: config.lastVerifiedAt,
          lastUpdatedAt: config.lastUpdatedAt
        }).catch(() => {});
      }

      return {
        authenticated: false,
        isValid: false,
        status: 'EXPIRED',
        reason: 'NAUKRI_LOGIN_REDIRECT',
        detail: reason,
        lastVerifiedAt: config.lastVerifiedAt
      };
    }

    return {
      authenticated: true,
      isValid: true,
      status: 'ACTIVE',
      candidateName: userKey,
      currentUrl,
      lastVerifiedAt: new Date().toISOString()
    };
  } catch (err) {
    logStructured('AUTH', `Session validation error: ${err.message}`);
    return {
      authenticated: false,
      isValid: false,
      status: 'INVALID',
      reason: err.message
    };
  }
}

/**
 * Standalone live session validation helper (launches headless Chrome, checks, and returns result)
 */
async function validateNaukriSession(userKey = 'default_user') {
  const browserPath = await ensureBrowserInstalled();
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };
  if (browserPath) launchOptions.executablePath = browserPath;

  let browser = null;
  try {
    browser = await puppeteer.launch(launchOptions);
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
    if (!restoreResult.hasSession) {
      if (restoreResult.failureType === 'AUTH_RESTORE_FAILED') {
        return {
          authenticated: false,
          isValid: false,
          status: 'AUTH_RESTORE_FAILED',
          reason: restoreResult.error || 'Browser failed to restore session'
        };
      }
      return {
        authenticated: false,
        isValid: false,
        status: 'NOT_CONFIGURED',
        reason: 'No session cookies found'
      };
    }

    const result = await validateNaukriSessionOnPage(page, userKey);
    return result;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

/**
 * Single source of truth for session health
 */
async function getNaukriSessionStatusAsync(userKey = 'default_user') {
  let cloudConf = null;
  if (isSupabaseConfigured()) {
    try {
      cloudConf = await supabaseGetNaukriConfig(userKey);
    } catch (e) {}
  }

  const localConf = getNaukriConfig(userKey);
  const activeCookies = (cloudConf && Array.isArray(cloudConf.sessionCookies) && cloudConf.sessionCookies.length > 0)
    ? cloudConf.sessionCookies
    : (localConf.sessionCookies || getNaukriSessionCookies(userKey));

  const hasCookies = Array.isArray(activeCookies) && activeCookies.length > 0;
  let status = cloudConf?.sessionStatus || localConf.sessionStatus || (hasCookies ? 'CONFIGURED' : 'NOT_CONFIGURED');

  if (!hasCookies && (status === 'ACTIVE' || status === 'CONFIGURED')) {
    status = 'NOT_CONFIGURED';
  }

  const lastVerifiedAt = cloudConf?.lastVerifiedAt || localConf.lastVerifiedAt || null;
  const lastUpdatedAt = cloudConf?.lastUpdatedAt || cloudConf?.updatedAt || localConf.lastUpdatedAt || null;
  const lastError = cloudConf?.lastError || localConf.lastError || null;

  return {
    status,
    authenticated: status === 'ACTIVE',
    lastVerifiedAt,
    lastUpdatedAt,
    reason: status === 'EXPIRED' ? (lastError || 'NAUKRI_LOGIN_REDIRECT') : (status === 'AUTH_RESTORE_FAILED' ? (lastError || 'AUTH_RESTORE_FAILED') : null),
    cookieCount: hasCookies ? activeCookies.length : 0,
    candidateName: cloudConf?.candidateName || localConf.candidateName || null
  };
}

function getNaukriSessionStatus(userKey = 'default_user') {
  const localConf = getNaukriConfig(userKey);
  const activeCookies = localConf.sessionCookies || getNaukriSessionCookies(userKey);
  const hasCookies = Array.isArray(activeCookies) && activeCookies.length > 0;
  let status = localConf.sessionStatus || (hasCookies ? 'CONFIGURED' : 'NOT_CONFIGURED');

  if (!hasCookies && (status === 'ACTIVE' || status === 'CONFIGURED')) {
    status = 'NOT_CONFIGURED';
  }

  return {
    status,
    authenticated: status === 'ACTIVE',
    lastVerifiedAt: localConf.lastVerifiedAt || null,
    lastUpdatedAt: localConf.lastUpdatedAt || null,
    reason: status === 'EXPIRED' ? (localConf.lastError || 'NAUKRI_LOGIN_REDIRECT') : (status === 'AUTH_RESTORE_FAILED' ? (localConf.lastError || 'AUTH_RESTORE_FAILED') : null),
    cookieCount: hasCookies ? activeCookies.length : 0,
    candidateName: localConf.candidateName || null
  };
}

async function getNaukriConfigAsync(userKey = 'default_user') {
  if (isSupabaseConfigured()) {
    try {
      const cloudConf = await supabaseGetNaukriConfig(userKey);
      if (cloudConf && typeof cloudConf === 'object') {
        const local = getNaukriConfig(userKey);
        const merged = { ...local, ...cloudConf };
        if (Array.isArray(cloudConf.sessionCookies) && cloudConf.sessionCookies.length > 0) {
          merged.sessionCookies = cloudConf.sessionCookies;
          merged.hasSession = true;
          const paths = getUserPaths(userKey);
          try { fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cloudConf.sessionCookies, null, 2), 'utf8'); } catch (e) {}
        }
        return merged;
      }
    } catch (e) {}
  }
  return getNaukriConfig(userKey);
}

function getNaukriConfig(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  const activeCookies = getNaukriSessionCookies(userKey);
  const hasActiveSession = Array.isArray(activeCookies) && activeCookies.length > 0;

  if (fs.existsSync(paths.naukriConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(paths.naukriConfigPath, 'utf8'));
      const envCookies = process.env.NAUKRI_COOKIES ? (() => { try { return JSON.parse(process.env.NAUKRI_COOKIES); } catch (e) { return null; } })() : null;
      const conf = {
        enabled: true,
        scheduleMode: 'quarter_day',
        slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
        customSlots: ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'],
        intervalHours: 6,
        intervalMinutes: 360,
        username: process.env.NAUKRI_USERNAME || '',
        password: process.env.NAUKRI_PASSWORD || '',
        hasSession: hasActiveSession || Boolean(envCookies),
        sessionStatus: hasActiveSession ? (saved.sessionStatus || 'CONFIGURED') : 'NOT_CONFIGURED',
        sessionCookies: activeCookies.length > 0 ? activeCookies : (envCookies || []),
        headless: true,
        autoApplyOnBoost: true,
        maxJobsPerRun: 12,
        searchKeywords: 'Full Stack Developer React Node.js Bangalore',
        eodTarget: 50,
        lastUploadAt: null,
        nextUploadAt: null,
        lastVerifiedAt: null,
        lastUpdatedAt: null,
        lastStatus: hasActiveSession ? 'Session Connected (Cookies)' : null,
        lastError: null,
        ...saved
      };
      if (hasActiveSession) {
        conf.sessionCookies = activeCookies;
      } else if ((!conf.sessionCookies || conf.sessionCookies.length === 0) && envCookies) {
        conf.sessionCookies = envCookies;
      }
      if (!conf.username && process.env.NAUKRI_USERNAME) conf.username = process.env.NAUKRI_USERNAME;
      if (!conf.password && process.env.NAUKRI_PASSWORD) conf.password = process.env.NAUKRI_PASSWORD;

      if (!conf.nextUploadAt) {
        conf.nextUploadAt = calculateNextUploadTime(conf).toISOString();
      }
      return conf;
    } catch (e) {}
  }
  const envCookies = process.env.NAUKRI_COOKIES ? (() => { try { return JSON.parse(process.env.NAUKRI_COOKIES); } catch (e) { return null; } })() : null;
  const defaultConf = {
    enabled: true,
    scheduleMode: 'quarter_day',
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    customSlots: ['09:30 AM', '01:30 PM', '04:30 PM', '06:30 PM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: process.env.NAUKRI_USERNAME || '',
    password: process.env.NAUKRI_PASSWORD || '',
    hasSession: hasActiveSession || Boolean(envCookies) || Boolean(process.env.NAUKRI_PASSWORD),
    sessionStatus: hasActiveSession ? 'CONFIGURED' : 'NOT_CONFIGURED',
    sessionCookies: activeCookies.length > 0 ? activeCookies : (envCookies || []),
    headless: true,
    autoApplyOnBoost: true,
    maxJobsPerRun: 12,
    searchKeywords: 'Full Stack Developer React Node.js Bangalore',
    eodTarget: 50,
    lastVerifiedAt: null,
    lastUpdatedAt: null,
    lastError: null
  };
  defaultConf.nextUploadAt = calculateNextUploadTime(defaultConf).toISOString();
  return defaultConf;
}

async function saveNaukriConfigAsync(userKey = 'default_user', config = {}) {
  const updated = saveNaukriConfig(userKey, config);
  if (isSupabaseConfigured()) {
    try {
      await supabaseSaveNaukriConfig(userKey, updated);
    } catch (e) {}
  }
  return updated;
}

function saveNaukriConfig(userKey = 'default_user', config = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const current = getNaukriConfig(userKey);
  const existingCookies = getNaukriSessionCookies(userKey);

  const cookiesToKeep = (config.sessionCookies && Array.isArray(config.sessionCookies))
    ? config.sessionCookies
    : (existingCookies.length > 0 ? existingCookies : (current.sessionCookies || []));

  const updated = {
    ...current,
    ...config,
    sessionCookies: cookiesToKeep,
    lastUpdatedAt: new Date().toISOString()
  };

  updated.hasSession = Array.isArray(updated.sessionCookies) && updated.sessionCookies.length > 0;
  if (updated.hasSession && (!updated.lastStatus || updated.lastStatus.includes('Disconnected'))) {
    updated.lastStatus = updated.sessionStatus === 'ACTIVE' ? 'Active & Verified' : 'Session Connected (Cookies)';
  }

  // Always recalculate nextUploadAt if scheduleMode or customSlots changed
  if (config.scheduleMode || config.customSlots || !updated.nextUploadAt) {
    updated.nextUploadAt = calculateNextUploadTime(updated).toISOString();
  }

  fs.writeFileSync(paths.naukriConfigPath, JSON.stringify(updated, null, 2), 'utf8');

  // Save session file if cookies are present
  if (Array.isArray(updated.sessionCookies) && updated.sessionCookies.length > 0) {
    fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(updated.sessionCookies, null, 2), 'utf8');
  } else if (updated.sessionCookies && updated.sessionCookies.length === 0 && fs.existsSync(paths.naukriSessionPath)) {
    try { fs.unlinkSync(paths.naukriSessionPath); } catch (e) {}
  }

  // Supabase Cloud Multi-Device Sync
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, updated).catch((err) => {
      console.warn('[SUPABASE] saveNaukriConfig background sync notice:', err.message);
    });
  }

  return updated;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getNaukriHistory(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriHistoryPath)) {
    try {
      return JSON.parse(fs.readFileSync(paths.naukriHistoryPath, 'utf8'));
    } catch (e) {}
  }
  return [];
}

function clearNaukriHistory(userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  fs.writeFileSync(paths.naukriHistoryPath, JSON.stringify([], null, 2), 'utf8');
  return [];
}

function appendNaukriHistory(userKey = 'default_user', record = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const history = getNaukriHistory(userKey);
  history.unshift({
    id: `naukri_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    ...record
  });
  fs.writeFileSync(paths.naukriHistoryPath, JSON.stringify(history.slice(0, 50), null, 2), 'utf8');

  // Supabase Cloud Multi-Device Sync
  if (isSupabaseConfigured()) {
    supabaseAppendNaukriHistory(userKey, record).catch(() => {});
  }
}

/**
 * Dismisses promotional overlays, feedback lightboxes, chatbots, and "Skip/Later" banners
 */
async function dismissNaukriPopups(page) {
  if (!page || page.isClosed()) return;
  try {
    await page.evaluate(() => {
      const selectors = [
        '.crossIcon',
        '.close-btn',
        '.modal-close',
        'button[title="Close"]',
        '#deny',
        '.lightbox-close',
        '.chat-close',
        '.chatbot_close',
        '.layer .close',
        'button.skip',
        'a.skip',
        '.skip-btn',
        'a[href*="skip"]',
        'button.later',
        'a.later'
      ];
      for (const s of selectors) {
        try {
          const elems = document.querySelectorAll(s);
          elems.forEach(el => {
            if (el && typeof el.click === 'function') el.click();
          });
        } catch (e) {}
      }
    });
  } catch (e) {}
}

/**
 * Safely clears and closes any pending 2FA OTP session for a specific user
 */
function clearActiveOtpSession(userKey) {
  if (activeOtpSessions.has(userKey)) {
    const session = activeOtpSessions.get(userKey);
    if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
    if (session.browser) {
      try {
        session.browser.close().catch(() => {});
      } catch (e) {}
    }
    activeOtpSessions.delete(userKey);
  }
}

/**
 * 1-Click Interactive Google SSO Sign-in Helper for specific user sandbox
 */
let activeSsoBrowser = null;

async function startInteractiveGoogleSsoLogin(userKey = 'default_user') {
  // Check if running in a headless cloud environment without a display
  if (process.platform !== 'win32' && !process.env.DISPLAY) {
    throw new Error('Interactive Google SSO requires a desktop browser window. On cloud hosting (Render), please use the Naukri Username & Password form to authenticate via 2FA OTP, or connect via Google SSO while running the app locally (which automatically syncs your session to the cloud).');
  }

  const browserPath = await ensureBrowserInstalled();
  console.log(`[NAUKRI SSO] Launching browser for user ${userKey} (${browserPath || 'Puppeteer default'})...`);

  if (activeSsoBrowser) {
    try { await activeSsoBrowser.close(); } catch (e) {}
    activeSsoBrowser = null;
  }

  const launchOptions = {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1200,800'
    ],
    defaultViewport: null
  };

  if (browserPath) {
    launchOptions.executablePath = browserPath;
  }

  const browser = await puppeteer.launch(launchOptions);
  activeSsoBrowser = browser;

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });

  return new Promise((resolve, reject) => {
    let timeoutTimer = null;
    let checkInterval = null;

    const cleanup = async () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (checkInterval) clearInterval(checkInterval);
      if (activeSsoBrowser) {
        try { await activeSsoBrowser.close(); } catch (e) {}
        activeSsoBrowser = null;
      }
    };

    timeoutTimer = setTimeout(async () => {
      await cleanup();
      reject(new Error('Google SSO login timed out after 3 minutes. Please try again.'));
    }, 180000);

    checkInterval = setInterval(async () => {
      try {
        if (!page || page.isClosed()) {
          await cleanup();
          resolve({
            success: hasValidNaukriSession(userKey),
            message: hasValidNaukriSession(userKey) ? 'Session saved successfully.' : 'Browser window was closed.'
          });
          return;
        }

        const currentUrl = page.url();
        const cookies = await page.cookies();
        const hasAuthCookie = cookies.some(c => 
          c.name.includes('nauk_session') || 
          c.name.includes('ubt_user') || 
          c.name.includes('isLoggedIn') || 
          c.name.includes('TOKEN')
        );

        const isProfileOrHome = currentUrl.includes('mnjuser/profile') || 
                                currentUrl.includes('naukri.com/homepage') || 
                                currentUrl.includes('naukri.com/mynaukri') ||
                                (currentUrl.includes('naukri.com') && !currentUrl.includes('nlogin') && !currentUrl.includes('login'));

        if ((isProfileOrHome && hasAuthCookie) || currentUrl.includes('mnjuser/profile')) {
          console.log(`[NAUKRI SSO] Google SSO login detected for user ${userKey}! Saving session cookies...`);
          
          ensureUserSandbox(userKey);
          const paths = getUserPaths(userKey);
          fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookies, null, 2), 'utf8');

          const config = getNaukriConfig(userKey);
          config.hasSession = true;
          config.lastStatus = 'Session Active (Google SSO)';
          saveNaukriConfig(userKey, config);

          await cleanup();
          resolve({
            success: true,
            message: 'Google SSO login successful! Session cookies saved for background auto-uploading.'
          });
        }
      } catch (err) {
        if (err.message.includes('Session closed') || err.message.includes('Target closed') || err.message.includes('destroyed')) {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (checkInterval) clearInterval(checkInterval);
          activeSsoBrowser = null;
          resolve({
            success: hasValidNaukriSession(userKey),
            message: hasValidNaukriSession(userKey) ? 'Session saved successfully.' : 'Browser window was closed.'
          });
        }
      }
    }, 1500);
  });
}

/**
 * Executes the resume upload on the active Naukri profile page
 */
async function performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime) {
  // 1. Navigate to Naukri Profile if not already there
  if (!page.url().includes('mnjuser/profile')) {
    console.log('[NAUKRI UPLOADER] Navigating to profile page for upload...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(3500);
  }

  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('nlogin')) {
    throw new Error('Naukri session is unauthenticated. Please link your account via the "Paste Session Cookie" button or verify your credentials in the settings tab.');
  }

  // 2. Dismiss any overlay popups or banners
  await dismissNaukriPopups(page);

  // 3. Progressive Smooth Scrolling to Mount React Lazy-Loaded Sections
  console.log('[NAUKRI UPLOADER] Progressively scrolling to trigger lazy-loaded sections...');
  await page.evaluate(async () => {
    // Try clicking Quick Links 'Resume' if present to jump directly to section
    const allLinks = Array.from(document.querySelectorAll('a, button, span, li, div'));
    const resumeLink = allLinks.find(el => {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();
      const dt = (el.getAttribute('data-target') || '').toLowerCase();
      return (txt === 'resume' || txt === 'update resume' || href.includes('resume') || href.includes('attachcv') || dt.includes('resume')) && el.offsetParent !== null;
    });
    if (resumeLink) {
      try {
        resumeLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
        resumeLink.click();
      } catch (e) {}
    }

    // Incremental scroll down to ensure all lazy cards (including #lazyResume) mount
    for (let scrollY of [300, 600, 900, 1200, 1600, 2000]) {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  await delay(2000);
  await dismissNaukriPopups(page);

  // 4. Locate Resume Upload Input Element or Trigger
  console.log('[NAUKRI UPLOADER] Locating resume upload input element across DOM and shadow trees...');

  let uploadedSuccessfully = false;

  // STRATEGY A: Direct File Input Element Search & Unhiding
  try {
    // Unhide all file inputs in the DOM so Puppeteer can interact with them directly
    await page.evaluate(() => {
      const fileInputs = document.querySelectorAll('input#attachCV, input[name="attachCV"], input[type="file"], input[accept*="pdf"], input[accept*="doc"], input.fileUpload, input.uploadCV');
      fileInputs.forEach(input => {
        try {
          input.style.display = 'block';
          input.style.visibility = 'visible';
          input.style.opacity = '1';
          input.style.width = '100px';
          input.style.height = '40px';
          input.style.position = 'fixed';
          input.style.top = '10px';
          input.style.left = '10px';
          input.style.zIndex = '999999';
        } catch (e) {}
      });
    });

    let fileInput = await page.$('input#attachCV') ||
                    await page.$('input[name="attachCV"]') ||
                    await page.$('input[accept*=".pdf"]') ||
                    await page.$('input[accept*="pdf"]') ||
                    await page.$('input.fileUpload') ||
                    await page.$('input[type="file"]');

    if (!fileInput) {
      // Check in all subframes
      for (const frame of page.frames()) {
        const frameInput = await frame.$('input#attachCV') || await frame.$('input[type="file"]');
        if (frameInput) {
          fileInput = frameInput;
          break;
        }
      }
    }

    if (fileInput) {
      console.log(`[NAUKRI UPLOADER] Strategy A: Found direct file input. Uploading resume as ${resumeFileName}...`);
      await fileInput.uploadFile(uploadPdfPath);

      // Dispatch change and input events with bubbling
      await page.evaluate(() => {
        const els = document.querySelectorAll('input#attachCV, input[name="attachCV"], input[accept*=".pdf"], input[type="file"]');
        els.forEach(el => {
          try {
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (e) {}
        });
      });

      uploadedSuccessfully = true;
    }
  } catch (errA) {
    console.warn('[NAUKRI UPLOADER] Strategy A notice:', errA.message);
  }

  // STRATEGY B: File Chooser Interception on Clickable Buttons, Labels, & Anchors
  if (!uploadedSuccessfully) {
    try {
      console.log('[NAUKRI UPLOADER] Strategy B: Attempting file chooser interception on clickable triggers...');
      
      const triggerSelectors = [
        'label[for="attachCV"]',
        'label[for*="resume" i]',
        'label[for*="cv" i]',
        '.updateResume',
        '.uploadBtn',
        '.dummyUploadBtn',
        '.upload-resume-btn',
        'button.updateResume',
        'button.uploadBtn',
        'a[href*="attachCV"]',
        'a.updateResume',
        '[title*="Update resume" i]',
        '[title*="Upload resume" i]',
        '.fileUploadBtn',
        '.btn-upload',
        '.attachCV'
      ];

      for (const selector of triggerSelectors) {
        if (uploadedSuccessfully) break;
        const triggerEls = await page.$$(selector);
        for (const trig of triggerEls) {
          try {
            const [fileChooser] = await Promise.all([
              page.waitForFileChooser({ timeout: 3500 }),
              trig.click()
            ]);
            if (fileChooser) {
              console.log(`[NAUKRI UPLOADER] Strategy B: Intercepted file chooser via ${selector}. Accepting ${uploadPdfPath}...`);
              await fileChooser.accept([uploadPdfPath]);
              uploadedSuccessfully = true;
              break;
            }
          } catch (e) {}
        }
      }

      // If still not triggered, search by text content
      if (!uploadedSuccessfully) {
        const handle = await page.evaluateHandle(() => {
          const allEls = Array.from(document.querySelectorAll('button, a, label, span, div'));
          return allEls.find(el => {
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            return (txt === 'update resume' || txt === 'upload resume' || txt === 'attach cv' || txt === 'upload new resume' || txt === 'update cv') && el.offsetParent !== null;
          }) || null;
        });
        const textEl = handle.asElement();
        if (textEl) {
          try {
            const [fileChooser] = await Promise.all([
              page.waitForFileChooser({ timeout: 3500 }),
              textEl.click()
            ]);
            if (fileChooser) {
              console.log(`[NAUKRI UPLOADER] Strategy B: Intercepted file chooser via text trigger. Accepting ${uploadPdfPath}...`);
              await fileChooser.accept([uploadPdfPath]);
              uploadedSuccessfully = true;
            }
          } catch (e) {}
        }
      }
    } catch (errB) {
      console.warn('[NAUKRI UPLOADER] Strategy B notice:', errB.message);
    }
  }

  // STRATEGY C: Authenticated In-Browser REST API Dispatch
  if (!uploadedSuccessfully) {
    try {
      console.log('[NAUKRI UPLOADER] Strategy C: Triggering authenticated in-browser REST upload API...');
      const fileBuffer = fs.readFileSync(uploadPdfPath);
      const base64Data = fileBuffer.toString('base64');

      const apiResult = await page.evaluate(async (b64, fname) => {
        try {
          const byteChars = atob(b64);
          const byteNumbers = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          const file = new File([blob], fname, { type: 'application/pdf' });

          const formData = new FormData();
          formData.append('attachCV', file);
          formData.append('userType', 'jobseeker');

          const endpoints = [
            'https://www.naukri.com/mnjuser/profile/uploadresume',
            'https://www.naukri.com/mnjuser/profile/attachcv',
            '/mnjuser/profile/uploadresume',
            '/mnjuser/profile/attachcv'
          ];

          for (const ep of endpoints) {
            try {
              const res = await fetch(ep, {
                method: 'POST',
                body: formData,
                credentials: 'include'
              });
              if (res.ok) {
                return { success: true, endpoint: ep };
              }
            } catch (err) {}
          }
          return { success: false };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }, base64Data, resumeFileName);

      if (apiResult && apiResult.success) {
        console.log(`[NAUKRI UPLOADER] Strategy C: Authenticated REST upload successful via ${apiResult.endpoint}!`);
        uploadedSuccessfully = true;
      }
    } catch (errC) {
      console.warn('[NAUKRI UPLOADER] Strategy C notice:', errC.message);
    }
  }

  if (!uploadedSuccessfully) {
    const currentFinalUrl = page.url();
    const pageTitle = await page.title().catch(() => 'Unknown');
    if (pageTitle.toLowerCase().includes('access denied') || currentFinalUrl.includes('login') || currentFinalUrl.includes('nlogin')) {
      throw new Error('Naukri session has expired (Access Denied). Please click "Paste Session Cookie" in the Naukri menu to refresh your cookie, or enter your Naukri password for automated login.');
    }
    throw new Error(`Could not locate the resume upload element on Naukri (Page: "${pageTitle}" at ${currentFinalUrl}). Please verify your Naukri session or credentials in the settings tab.`);
  }

  // Check if a modal Save/Upload button is displayed
  try {
    await page.evaluate(() => {
      const saveBtn = document.querySelector('button.saveBtn, button.upload-save, .upload-modal button[type="submit"], button.btn-save, button.primary-btn');
      if (saveBtn) saveBtn.click();
    });
  } catch (e) {}

  // Wait for Naukri AJAX document upload and processing to finish (6-8 seconds)
  console.log('[NAUKRI UPLOADER] Waiting for Naukri backend AJAX upload processing...');
  await delay(7000);

  const updatedStatusText = await page.evaluate(() => {
    const selectors = ['.updateOn', '.lastUpdated', '.msg', '.success-msg', '.msg-box', '.status-msg', '.toast', '.snackbar', '.server-msg', '.resume-name', '.file-name'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim().length > 0) {
        return el.innerText.trim();
      }
    }
    return 'Resume uploaded successfully';
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[RESUME] Upload successful (${resumeFileName} active just now in ${durationSec}s)!`);
  console.log(`[NAUKRI UPLOADER] SUCCESS! Profile refreshed in ${durationSec}s as ${resumeFileName} for user ${userKey}. Status: ${updatedStatusText}`);

  // Save session cookies
  const sessionCookies = await page.cookies();
  const userPaths = getUserPaths(userKey);
  fs.writeFileSync(userPaths.naukriSessionPath, JSON.stringify(sessionCookies, null, 2), 'utf8');
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, { sessionCookies, hasSession: true }).catch(() => {});
  }

  const config = getNaukriConfig(userKey);
  const nextRunDate = calculateNextUploadTime(config);

  config.hasSession = true;
  config.lastUploadAt = new Date().toISOString();
  config.lastStatus = 'Success';
  config.lastError = null;
  config.nextUploadAt = nextRunDate.toISOString();
  saveNaukriConfig(userKey, config);

  appendNaukriHistory(userKey, {
    status: 'success',
    fileName: resumeFileName,
    message: `Resume refreshed on Naukri as ${resumeFileName} (Active Just Now)`,
    duration: `${durationSec}s`,
    profileStatus: updatedStatusText
  });

  return {
    status: 'success',
    fileName: resumeFileName,
    message: `Resume updated successfully on Naukri profile as ${resumeFileName} (Active Just Now)`,
    duration: `${durationSec}s`,
    timestamp: new Date().toISOString(),
    profileStatus: updatedStatusText
  };
}

/**
 * Automates logging into Naukri & uploading fresh 1-page PDF resume for specific user
 */
async function uploadResumeToNaukri(userKey = 'default_user', overrideOptions = {}) {
  // 0. Acquire Distributed Concurrency Lock
  const lockAcquired = await acquireUserLockAsync(userKey, 'resume_uploader');
  if (!lockAcquired) {
    throw new Error(`Account "${userKey}" is already executing an active Naukri automation task. Concurrent run prevented.`);
  }

  try {
    clearActiveOtpSession(userKey);

    const userPaths = getUserPaths(userKey);
    const config = await getNaukriConfigAsync(userKey);
    let username = overrideOptions.username || config.username;
    let password = overrideOptions.password || config.password;
    const headless = overrideOptions.headless !== undefined ? overrideOptions.headless : (config.headless !== false);

    if (overrideOptions.username || overrideOptions.password) {
      await saveNaukriConfigAsync(userKey, {
        username: username || config.username,
        password: password || config.password
      });
    }

    const startTime = Date.now();
    logStructured('ACCOUNT', `Starting resume upload workflow for user "${userKey}"...`);

    // 1. Dynamically Retrieve and Resolve Resume from Database (Zero hardcoding)
    logStructured('RESUME', `Fetching resume from DB for user "${userKey}"...`);
    const resolvedResume = await resolveUserResumeFile(userKey);
    const uploadPdfPath = resolvedResume.filePath;
    const resumeFileName = resolvedResume.fileName;

    logStructured('RESUME', `File resolved: ${resumeFileName} (${(resolvedResume.fileSize / 1024).toFixed(1)} KB, source: ${resolvedResume.source})`);

    // 2. Discover Browser Executable
    let browserPath = await ensureBrowserInstalled();
    logStructured('BROWSER', `Launching browser engine (${browserPath || 'Puppeteer default'})...`);

    let browser = null;
    let uploadResult = null;
    let isOtpWaiting = false;

    try {
      const launchOptions = {
        headless: headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1366,768'
        ],
        defaultViewport: { width: 1366, height: 768 }
      };

      if (browserPath) {
        launchOptions.executablePath = browserPath;
      }

      try {
        browser = await puppeteer.launch(launchOptions);
      } catch (launchErr) {
        if (launchErr.message.includes('Could not find Chrome') || launchErr.message.includes('executablePath')) {
          console.warn('[NAUKRI UPLOADER] Initial launch failed. Retrying on-demand install...', launchErr.message);
          browserPath = await ensureBrowserInstalled();
          if (browserPath) launchOptions.executablePath = browserPath;
          browser = await puppeteer.launch(launchOptions);
        } else {
          throw launchErr;
        }
      }

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

      // Anti-bot stealth
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });

      // 3. Restore and Inject Saved Session State BEFORE navigating to Naukri
      const restoreResult = await restoreAndInjectNaukriSession(page, userKey);
      if (!restoreResult.hasSession) {
        if (restoreResult.failureType === 'AUTH_RESTORE_FAILED') {
          logStructured('AUTH', `Session restore failed for user "${userKey}"`);
          throw new Error(`[AUTH_RESTORE_FAILED] Application failed to restore saved session into browser context: ${restoreResult.error}`);
        }
        if (!username || !password) {
          logStructured('AUTH', `No session found for user "${userKey}"`);
          throw new Error('Naukri session is unauthenticated. Please link your account via "Paste Session Cookie".');
        }
      }

      // 4. Validate Live Session on Naukri BEFORE Doing Anything
      let validation = { isValid: false, reason: 'NOT_CHECKED' };
      if (restoreResult.hasSession) {
        validation = await validateNaukriSessionOnPage(page, userKey);
      }

      if (!validation.isValid) {
        logStructured('AUTH', `Live session validation rejected by Naukri (${validation.reason || 'Session expired'}) for user "${userKey}"`);
        if (!username || !password) {
          const cfg = getNaukriConfig(userKey);
          cfg.hasSession = false;
          cfg.sessionStatus = 'EXPIRED';
          cfg.lastStatus = 'SESSION EXPIRED (Please Re-Link Cookie or Enter Credentials)';
          cfg.lastError = `Naukri session has expired on the server (${validation.detail || validation.reason || 'Session expired'}). Please click "Paste Session Cookie" in settings to refresh your cookie.`;
          await saveNaukriConfigAsync(userKey, cfg);

          throw new Error(`Naukri session has expired on the server (${validation.detail || validation.reason || 'Redirected to login page'}). Please click the "Paste Session Cookie" button in the Naukri menu to link your fresh browser cookie.`);
        }

        logStructured('AUTH', `Attempting automated credentials authentication for user "${userKey}"...`);
        let currentUrl = page.url();
        if (!currentUrl.includes('login') && !currentUrl.includes('nlogin')) {
          await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
          await delay(2500);
        }

        // Fill and submit login form
        const loginAttemptResult = await page.evaluate((u, p) => {
          const allInputs = Array.from(document.querySelectorAll('input'));

          let userInp = allInputs.find(i => {
            const type = (i.type || '').toLowerCase();
            const ph = (i.placeholder || '').toLowerCase();
            const id = (i.id || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button' || type === 'checkbox') return false;
            if (ph.includes('search') || id.includes('search') || name.includes('search')) return false;
            return id === 'usernamefield' || id === 'login_email' || ph.includes('email') || ph.includes('username') || name.includes('email') || name.includes('username') || type === 'email';
          }) || allInputs.find(i => (i.type === 'text' || !i.type) && i.type !== 'hidden' && i.type !== 'password' && i.offsetParent !== null);

          let passInp = allInputs.find(i => (i.type || '').toLowerCase() === 'password');

          if (userInp) {
            userInp.focus();
            userInp.value = u;
            userInp.dispatchEvent(new Event('input', { bubbles: true }));
            userInp.dispatchEvent(new Event('change', { bubbles: true }));
          }

          if (passInp) {
            passInp.focus();
            passInp.value = p;
            passInp.dispatchEvent(new Event('input', { bubbles: true }));
            passInp.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const submitBtn = document.querySelector('button[type="submit"], button.btn-primary, button.loginButton, button.blueBtn, button.login-btn, form button, .login-layer-wrapper button, .drawer-wrapper button[type="submit"]');
          if (submitBtn && userInp && passInp) {
            submitBtn.click();
            return { filled: true, submitted: true };
          }

          return { filled: !!userInp && !!passInp, submitted: false };
        }, username, password);

        await delay(500);
        await page.keyboard.press('Enter');

        // Poll for session authentication or OTP
        let loginSuccess = false;
        let detectedOtp = false;

        for (let attempt = 0; attempt < 25; attempt++) {
          await delay(800);

          const loginErrorText = await page.evaluate(() => {
            const el = document.querySelector('.server-err, .err, .error, .login-error, .errMsg, .error-message, .err-msg, [role="alert"]');
            return el ? el.innerText.trim() : null;
          }).catch(() => null);

          if (loginErrorText && loginErrorText.length > 0 && !loginErrorText.toLowerCase().includes('otp')) {
            throw new Error(`Naukri Login Failed: ${loginErrorText}`);
          }

          let curUrl = '';
          try { curUrl = page.url(); } catch (e) {}

          const hasOtpInput = await page.evaluate(() => {
            const el = document.querySelector('input[placeholder*="OTP" i], input[placeholder*="verification" i], input[placeholder*="code" i], input[type="tel"]:not(#usernameField), input.otp-input, input[name*="otp" i], input[id*="otp" i], .otpBox, .otp-digit');
            return !!el;
          }).catch(() => false);

          if (curUrl.includes('otp') || curUrl.includes('verification') || hasOtpInput) {
            detectedOtp = true;
            break;
          }

          let cookies = [];
          try { cookies = await page.cookies(); } catch (e) {}
          const hasSessionCookie = cookies.some(c =>
            c.name.includes('nauk_session') ||
            c.name.includes('ubt_user') ||
            c.name.includes('isLoggedIn')
          );

          if (hasSessionCookie || curUrl.includes('mnjuser/profile') || curUrl.includes('mnjuser/homepage') || curUrl.includes('mynaukri') || (!curUrl.includes('nlogin') && !curUrl.includes('login'))) {
            loginSuccess = true;
            break;
          }
        }

        if (detectedOtp) {
          logStructured('AUTH', `2FA OTP verification required for user ${userKey}. Keeping browser open for user submission...`);
          isOtpWaiting = true;

          const timeoutTimer = setTimeout(() => {
            logStructured('AUTH', `OTP session timed out after 5 minutes for user ${userKey}. Closing browser...`);
            clearActiveOtpSession(userKey);
          }, 300000);

          activeOtpSessions.set(userKey, {
            browser,
            page,
            userPaths,
            resumeFileName,
            uploadPdfPath,
            startTime,
            createdAt: Date.now(),
            timeoutTimer
          });

          return {
            status: 'otp_required',
            requiresOtp: true,
            message: 'Naukri sent a 6-digit OTP to your registered email/phone. Please enter it below to authorize your session.'
          };
        }

        if (!loginSuccess) {
          let finalUrl = '';
          try { finalUrl = page.url(); } catch (e) {}
          if (finalUrl.includes('login') || finalUrl.includes('nlogin')) {
            throw new Error('Naukri login did not complete (session unauthenticated). If your account uses Google SSO or 2FA, please click the "Paste Session Cookie" button to link your session in 5 seconds without a password.');
          }
        }

        const sessionCookies = await page.cookies();
        await saveNaukriSessionCookiesAsync(userKey, sessionCookies, { status: 'ACTIVE' });
        logStructured('AUTH', `Authentication successful. Session cookies saved for user ${userKey}.`);
      }

      // 6. Perform Resume Upload on Profile Page
      uploadResult = await performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime);

      // 7. In-Browser Easy Apply: Automatically search and apply to 12 jobs during this scheduled slot
      if (uploadResult && uploadResult.status === 'success' && config.autoApplyOnBoost !== false) {
        logStructured('APPLY', `Profile boosted! Now discovering and applying to top ${config.maxJobsPerRun || 12} diverse Easy Apply jobs on Naukri...`);
        try {
          const { applyToNaukriJobsWithPuppeteer } = require('./naukri_apply.service');
          const applyReport = await applyToNaukriJobsWithPuppeteer(page, userKey, config);
          uploadResult.appliedJobsCount = applyReport.appliedCount || 0;
          uploadResult.appliedJobs = applyReport.appliedJobs || [];
          uploadResult.message = `${uploadResult.message || 'Profile Refreshed'} & Applied to ${applyReport.appliedCount || 0} Jobs on Naukri`;
        } catch (applyErr) {
          console.warn(`[NAUKRI AUTO-APPLY WARNING for ${userKey}]`, applyErr.message);
        }
      }

    } catch (err) {
      logStructured('ERROR', `Automation workflow error for user "${userKey}": ${err.message}`);
      const durationSec = Math.round((Date.now() - startTime) / 1000);
      const isRestoreError = err.message.includes('AUTH_RESTORE_FAILED');
      const isAuthError = !isRestoreError && (
        err.message.toLowerCase().includes('unauthenticated') ||
        err.message.toLowerCase().includes('session has expired') ||
        err.message.toLowerCase().includes('access denied') ||
        err.message.toLowerCase().includes('login')
      );

      uploadResult = {
        status: 'error',
        error: err.message,
        failureStage: isRestoreError ? 'AUTH_RESTORE_FAILED' : (isAuthError ? 'Authentication Required' : 'Execution Error'),
        duration: `${durationSec}s`,
        timestamp: new Date().toISOString()
      };

      if (isRestoreError) {
        config.sessionStatus = 'AUTH_RESTORE_FAILED';
        config.lastStatus = 'Session Restore Failed (Internal Browser Error)';
        config.lastError = err.message;
        config.nextUploadAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      } else if (isAuthError) {
        config.hasSession = false;
        config.sessionStatus = 'EXPIRED';
        config.lastStatus = 'SESSION EXPIRED (Please Re-Link Cookie or Enter Credentials)';
        config.lastError = err.message;
        config.nextUploadAt = calculateNextUploadTime(config).toISOString();
      } else {
        config.lastStatus = 'Failed';
        config.lastError = err.message;
        config.nextUploadAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      }
      await saveNaukriConfigAsync(userKey, config);

      appendNaukriHistory(userKey, {
        status: isRestoreError ? 'AUTH_RESTORE_FAILED' : (isAuthError ? 'SESSION_EXPIRED' : 'failed'),
        error: err.message,
        profileStatus: isRestoreError ? 'Restore Failed' : (isAuthError ? 'Session Expired - Re-authentication Required' : 'Upload Failed'),
        duration: `${durationSec}s`
      });

      throw err;
    } finally {
      if (browser && !isOtpWaiting) {
        try { await browser.close(); } catch (e) {}
      }
    }

    return uploadResult;
  } finally {
    await releaseUserLockAsync(userKey, 'resume_uploader');
  }
}

/**
 * 24/7 Automation Scheduler across all active candidate accounts
 */
let naukriSchedulerTimer = null;

function initNaukriScheduler() {
  if (naukriSchedulerTimer) clearInterval(naukriSchedulerTimer);

  logStructured('SCHEDULER', 'Initialized 24/7 automated uploader ticker across all active user accounts in database.');

  naukriSchedulerTimer = setInterval(async () => {
    try {
      await triggerNaukriUploadForActiveUsers({ force: false });
    } catch (err) {
      console.warn('[NAUKRI SCHEDULER TICKER WARN]', err.message);
    }
  }, 30000); // Check every 30s
}

/**
 * Verifies interactive Naukri 2FA OTP submitted by user
 */
async function verifyNaukriOtp(userKey, otpCode) {
  const session = activeOtpSessions.get(userKey);
  if (!session || !session.browser || !session.page || session.page.isClosed()) {
    clearActiveOtpSession(userKey);
    throw new Error('No active OTP verification session found or session timed out. Please click "Boost Profile Now" again to receive a fresh OTP.');
  }

  const { browser, page, uploadPdfPath, resumeFileName, startTime } = session;

  try {
    logStructured('AUTH', `Submitting 2FA OTP for user ${userKey}...`);

    try {
      await page.waitForSelector('input[maxlength="1"], input.otpBox, input.otp-digit, input[placeholder*="OTP" i], input[placeholder*="verification" i], input[name*="otp" i], input[id*="otp" i], input[type="tel"]:not(#usernameField)', { timeout: 15000 });
    } catch (e) {}

    const fillResult = await page.evaluate((code) => {
      const digitBoxes = Array.from(document.querySelectorAll('input[maxlength="1"], .otp-digit, input.otpBox, input.digit-input, input[id*="otp" i][maxlength="1"], .otp-input input'));
      if (digitBoxes.length >= 6) {
        const chars = code.split('');
        chars.forEach((c, idx) => {
          if (digitBoxes[idx]) {
            digitBoxes[idx].focus();
            digitBoxes[idx].value = c;
            digitBoxes[idx].dispatchEvent(new Event('input', { bubbles: true }));
            digitBoxes[idx].dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        return 'boxes';
      }

      const otpInput = document.querySelector('input[placeholder*="OTP" i], input[placeholder*="verification" i], input[placeholder*="code" i], input[name*="otp" i], input[id*="otp" i], input.otp-input, input[type="tel"]:not(#usernameField), input.otpField, input[data-test*="otp" i]');
      if (otpInput) {
        otpInput.focus();
        otpInput.value = code;
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'single';
      }

      return null;
    }, otpCode).catch(() => null);

    if (!fillResult) {
      try {
        const input = await page.$('input[placeholder*="OTP" i], input[type="tel"], input.otp-input, input[name="otp"], input[id*="otp" i]');
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type(otpCode, { delay: 25 });
        }
      } catch (e) {}
    }

    await page.keyboard.press('Enter');
    await delay(600);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
      for (const btn of buttons) {
        const text = (btn.innerText || btn.value || '').toLowerCase();
        if ((text.includes('verify') || text.includes('submit') || text.includes('continue') || text.includes('login') || text.includes('proceed')) && !text.includes('resend')) {
          btn.click();
          return;
        }
      }
      const submitBtn = document.querySelector('button[type="submit"], .verifyOtpBtn, button.btn-primary, button.loginButton');
      if (submitBtn) submitBtn.click();
    }).catch(() => {});

    let isAuthenticated = false;
    let failureReason = null;

    for (let attempt = 0; attempt < 24; attempt++) {
      await delay(600);

      const errText = await page.evaluate(() => {
        const el = document.querySelector('.server-err, .err, .error, .login-error, .errMsg, .error-msg, .otp-error, [role="alert"], .err-msg, .error-message');
        return el ? el.innerText.trim() : null;
      }).catch(() => null);

      if (errText && (errText.toLowerCase().includes('otp') || errText.toLowerCase().includes('invalid') || errText.toLowerCase().includes('expired') || errText.toLowerCase().includes('incorrect') || errText.toLowerCase().includes('wrong'))) {
        failureReason = `Naukri OTP Verification Failed: ${errText}`;
        break;
      }

      let currentUrl = '';
      try { currentUrl = page.url(); } catch (e) {}

      let cookies = [];
      try { cookies = await page.cookies(); } catch (e) {}

      const hasAuthCookie = cookies.some(c => 
        c.name.includes('nauk_session') || 
        c.name.includes('ubt_user') || 
        c.name.includes('isLoggedIn') || 
        c.name.includes('TOKEN')
      );

      if (hasAuthCookie || currentUrl.includes('mnjuser/profile') || currentUrl.includes('mnjuser/homepage') || currentUrl.includes('mynaukri') || (!currentUrl.includes('nlogin') && !currentUrl.includes('login') && !currentUrl.includes('otp'))) {
        isAuthenticated = true;
        break;
      }
    }

    if (failureReason) {
      throw new Error(failureReason);
    }

    if (!isAuthenticated) {
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('otp')) {
        throw new Error('Naukri did not accept the OTP. Please verify the 6-digit code and try again.');
      }
    }

    logStructured('AUTH', `OTP verified successfully for user ${userKey}!`);

    await dismissNaukriPopups(page);
    const uploadResult = await performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime);
    clearActiveOtpSession(userKey);

    return {
      status: 'success',
      fileName: resumeFileName,
      message: `2FA OTP Verified! Resume successfully uploaded as ${resumeFileName} (Active Just Now). Future scheduled boosts will run automatically!`,
      duration: uploadResult.duration,
      timestamp: new Date().toISOString(),
      profileStatus: uploadResult.profileStatus
    };
  } catch (err) {
    clearActiveOtpSession(userKey);
    throw err;
  }
}

/**
 * Triggers resume upload dynamically for active candidate users in the database
 */
async function triggerNaukriUploadForActiveUsers(options = {}) {
  const { force = false, targetUserKey = null } = options;
  const results = [];
  const cronStartTime = Date.now();

  logStructured('CRON', `Starting 24/7 Naukri Cron Execution (force: ${force}, targetUserKey: ${targetUserKey || 'ALL'})...`);

  // 1. Discover all candidate users dynamically from Supabase database and local sandboxes
  let targetUsers = [];

  if (targetUserKey && targetUserKey !== 'all') {
    targetUsers = [targetUserKey];
  } else {
    const userKeySet = new Set();

    if (isSupabaseConfigured()) {
      try {
        const dbUsers = await supabaseGetAllUsers();
        if (Array.isArray(dbUsers)) {
          dbUsers.forEach(u => {
            if (u && u.userKey) userKeySet.add(u.userKey);
          });
        }
      } catch (e) {
        console.warn('[NAUKRI CRON TRIGGER WARNING] Error discovering users from Supabase:', e.message);
      }
    }

    getAllUserKeys().forEach(k => {
      if (k) userKeySet.add(k);
    });

    if (userKeySet.size === 0) {
      userKeySet.add('default_user');
    }

    targetUsers = Array.from(userKeySet);
  }

  logStructured('CRON', `Identified ${targetUsers.length} user account(s) to evaluate: [${targetUsers.join(', ')}]`);

  for (const userKey of targetUsers) {
    logStructured('ACCOUNT', `Evaluating user account: "${userKey}"...`);
    try {
      if (await isUserLockedAsync(userKey)) {
        logStructured('LOCK', `Skipped "${userKey}": Account is locked by an ongoing automation process.`);
        results.push({ userKey, skipped: true, reason: 'Account locked by ongoing process' });
        continue;
      }

      if (isSupabaseConfigured()) {
        try {
          await hydrateUserSandboxFromDatabase(userKey);
        } catch (e) {}
      }

      const config = await getNaukriConfigAsync(userKey);
      if (!config.enabled && !force) {
        logStructured('CRON', `Skipped "${userKey}": Scheduler disabled in config.`);
        results.push({ userKey, skipped: true, reason: 'Scheduler disabled in config' });
        continue;
      }

      const paths = getUserPaths(userKey);
      const hasSession = (Array.isArray(config.sessionCookies) && config.sessionCookies.length > 0) || fs.existsSync(paths.naukriSessionPath) || Boolean(config.username);
      if (!hasSession && !force) {
        logStructured('CRON', `Skipped "${userKey}": No active session or credentials found.`);
        results.push({ userKey, skipped: true, reason: 'No active session or credentials found' });
        continue;
      }

      const now = new Date();
      const nextRun = config.nextUploadAt ? new Date(config.nextUploadAt) : new Date(0);

      const isDue = now >= nextRun || (nextRun.getTime() - now.getTime() <= 15 * 60 * 1000);

      if (force || isDue) {
        logStructured('CRON', `Executing slot workflow for user "${userKey}" (force: ${force}, due: ${isDue})...`);
        const uploadResult = await uploadResumeToNaukri(userKey);
        const updatedConfig = await getNaukriConfigAsync(userKey);
        const uploadedFileName = uploadResult?.fileName || 'resume.pdf';

        logStructured('CRON', `Auto-upload and Easy Apply completed successfully for user "${userKey}" (File: ${uploadedFileName})`);
        results.push({
          userKey,
          status: 'success',
          fileName: uploadedFileName,
          uploadResult,
          nextUploadAt: updatedConfig.nextUploadAt
        });
      } else {
        logStructured('CRON', `Skipped "${userKey}": Next upload scheduled at ${config.nextUploadAt} (current time: ${now.toISOString()})`);
        results.push({
          userKey,
          skipped: true,
          reason: `Next upload scheduled at ${config.nextUploadAt} (current time: ${now.toISOString()})`,
          nextUploadAt: config.nextUploadAt
        });
      }
    } catch (err) {
      logStructured('ERROR', `Cron error for user "${userKey}": ${err.message}`);
      results.push({
        userKey,
        status: 'error',
        error: err.message
      });
    }
  }

  logStructured(
    'CRON',
    `Cron run finished in ${Date.now() - cronStartTime}ms. ` +
    `Summary: ${results.filter(r => r.status === 'success').length} succeeded, ` +
    `${results.filter(r => r.skipped).length} skipped, ` +
    `${results.filter(r => r.status === 'error').length} failed.`
  );

  return results;
}

module.exports = {
  getNextQuarterDayTime,
  calculateNextUploadTime,
  findBrowserExecutable,
  ensureBrowserInstalled,
  hasValidNaukriSession,
  getNaukriSessionCookies,
  saveNaukriSessionCookies,
  saveNaukriSessionCookiesAsync,
  clearNaukriSession,
  clearNaukriSessionAsync,
  restoreAndInjectNaukriSession,
  validateNaukriSessionOnPage,
  validateNaukriSession,
  getNaukriSessionStatus,
  getNaukriSessionStatusAsync,
  getNaukriConfig,
  getNaukriConfigAsync,
  saveNaukriConfig,
  saveNaukriConfigAsync,
  getNaukriHistory,
  clearNaukriHistory,
  appendNaukriHistory,
  startInteractiveGoogleSsoLogin,
  uploadResumeToNaukri,
  verifyNaukriOtp,
  initNaukriScheduler,
  triggerNaukriUploadForActiveUsers,
  acquireUserLock,
  acquireUserLockAsync,
  releaseUserLock,
  releaseUserLockAsync,
  isUserLocked,
  isUserLockedAsync,
  logStructured
};