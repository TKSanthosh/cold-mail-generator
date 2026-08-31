let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}
const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { getUserResume, getUserPaths, ensureUserSandbox, addUserLog, getAllUserKeys } = require('./user.service');
const {
  isSupabaseConfigured,
  supabaseSaveNaukriConfig,
  supabaseGetNaukriConfig,
  supabaseAppendNaukriHistory,
  supabaseGetNaukriHistory
} = require('./supabase.service');

const USERS_DIR = path.join(__dirname, '../../users');
const activeOtpSessions = new Map();

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
      : ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'];

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

function saveNaukriSessionCookies(userKey = 'default_user', cookieInput) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  let cookiesToSave = [];

  if (Array.isArray(cookieInput)) {
    cookiesToSave = cookieInput.map(c => ({
      name: c.name || c.key || '',
      value: c.value || '',
      domain: c.domain || '.naukri.com',
      path: c.path || '/'
    })).filter(c => c.name && c.value);
  } else if (typeof cookieInput === 'string') {
    const trimmed = cookieInput.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        cookiesToSave = arr.map(c => ({
          name: c.name || c.key || '',
          value: c.value || '',
          domain: c.domain || '.naukri.com',
          path: c.path || '/'
        })).filter(c => c.name && c.value);
      } catch (e) {}
    }

    if (cookiesToSave.length === 0 && trimmed.includes('=')) {
      // Parse document.cookie string (e.g. "nauk_session=abc; ubt_user=xyz; ...")
      const pairs = trimmed.split(';');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx !== -1) {
          const k = pair.substring(0, idx).trim();
          const v = pair.substring(idx + 1).trim();
          if (k) {
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

    // Fallback: single raw token
    if (cookiesToSave.length === 0 && trimmed.length > 10 && !trimmed.includes(' ') && !trimmed.includes('\n')) {
      cookiesToSave.push({
        name: 'nauk_session',
        value: trimmed,
        domain: '.naukri.com',
        path: '/'
      });
    }
  }

  if (cookiesToSave.length > 0) {
    fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(cookiesToSave, null, 2), 'utf8');
    const config = getNaukriConfig(userKey);
    config.hasSession = true;
    config.lastStatus = 'Session Connected (Cookies)';
    config.lastError = null;
    config.sessionCookies = cookiesToSave;
    saveNaukriConfig(userKey, config);

    if (isSupabaseConfigured()) {
      supabaseSaveNaukriConfig(userKey, { ...config, sessionCookies: cookiesToSave, hasSession: true }).catch(() => {});
    }

    appendNaukriHistory(userKey, {
      status: 'Session Linked',
      detail: `Linked ${cookiesToSave.length} session cookies via Paste Session Cookie`,
      profileStatus: 'Session Active & Synced to Cloud DB'
    });

    addUserLog(userKey, {
      type: 'naukri_session',
      status: 'Session Linked',
      company: 'Naukri.com',
      detail: `Linked ${cookiesToSave.length} session cookies. 24/7 background auto-uploader active in Cloud DB.`
    });

    return {
      success: true,
      count: cookiesToSave.length,
      message: `Successfully linked Naukri session (${cookiesToSave.length} cookies)! Profile boosts will now run 100% automatically in the background even when your laptop is closed.`
    };
  }

  throw new Error('Could not parse session cookies. Please paste your cookies as a document.cookie string (e.g. "nauk_session=...") or JSON array.');
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

function clearNaukriSession(userKey = 'default_user') {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriSessionPath)) {
    try { fs.unlinkSync(paths.naukriSessionPath); } catch (e) {}
  }
  const config = getNaukriConfig(userKey);
  config.hasSession = false;
  config.lastStatus = 'Session Disconnected';
  saveNaukriConfig(userKey, config);

  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, { sessionCookies: [], hasSession: false }).catch(() => {});
  }
  return { success: true, message: 'Naukri session disconnected.' };
}

function getNaukriConfig(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  const activeCookies = getNaukriSessionCookies(userKey);
  const hasActiveSession = Array.isArray(activeCookies) && activeCookies.length > 0;

  if (fs.existsSync(paths.naukriConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(paths.naukriConfigPath, 'utf8'));
      const conf = {
        enabled: true,
        scheduleMode: 'quarter_day',
        slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
        customSlots: ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'],
        intervalHours: 6,
        intervalMinutes: 360,
        username: '',
        password: '',
        hasSession: hasActiveSession,
        sessionCookies: activeCookies,
        headless: true,
        lastUploadAt: null,
        nextUploadAt: null,
        lastStatus: hasActiveSession ? 'Session Connected (Cookies)' : null,
        lastError: null,
        ...saved,
        hasSession: hasActiveSession || (Array.isArray(saved.sessionCookies) && saved.sessionCookies.length > 0)
      };
      if (hasActiveSession) {
        conf.sessionCookies = activeCookies;
      }
      if (!conf.nextUploadAt) {
        conf.nextUploadAt = calculateNextUploadTime(conf).toISOString();
      }
      return conf;
    } catch (e) {}
  }
  const defaultConf = {
    enabled: true,
    scheduleMode: 'quarter_day',
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    customSlots: ['09:30 AM', '01:30 PM', '05:30 PM', '09:30 PM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: '',
    password: '',
    hasSession: hasActiveSession,
    sessionCookies: activeCookies,
    headless: true,
    lastUploadAt: null,
    lastStatus: hasActiveSession ? 'Session Connected (Cookies)' : null,
    lastError: null
  };
  defaultConf.nextUploadAt = calculateNextUploadTime(defaultConf).toISOString();
  return defaultConf;
}

function saveNaukriConfig(userKey = 'default_user', config = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const current = getNaukriConfig(userKey);
  const existingCookies = getNaukriSessionCookies(userKey);

  const cookiesToKeep = (config.sessionCookies && config.sessionCookies.length > 0)
    ? config.sessionCookies
    : (existingCookies.length > 0 ? existingCookies : (current.sessionCookies || []));

  const updated = {
    ...current,
    ...config,
    sessionCookies: cookiesToKeep
  };

  updated.hasSession = Array.isArray(updated.sessionCookies) && updated.sessionCookies.length > 0;
  if (updated.hasSession && (!updated.lastStatus || updated.lastStatus.includes('Disconnected'))) {
    updated.lastStatus = 'Session Connected (Cookies)';
  }

  // Always recalculate nextUploadAt if scheduleMode or customSlots changed
  if (config.scheduleMode || config.customSlots || !updated.nextUploadAt) {
    updated.nextUploadAt = calculateNextUploadTime(updated).toISOString();
  }

  fs.writeFileSync(paths.naukriConfigPath, JSON.stringify(updated, null, 2), 'utf8');

  // Save session file if cookies are present
  if (Array.isArray(updated.sessionCookies) && updated.sessionCookies.length > 0) {
    fs.writeFileSync(paths.naukriSessionPath, JSON.stringify(updated.sessionCookies, null, 2), 'utf8');
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
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await delay(2500);
  }

  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('nlogin')) {
    throw new Error('Naukri session is unauthenticated. Please link your account via the "Paste Session Cookie" button or verify your credentials in the settings tab.');
  }

  // 2. Dismiss any overlay popups or banners
  await dismissNaukriPopups(page);

  // 3. Scroll down slightly to trigger lazy-loaded sections
  try {
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1000);
  } catch (e) {}

  await dismissNaukriPopups(page);

  // 4. Locate Resume Upload Input Element
  console.log('[NAUKRI UPLOADER] Locating resume upload input element...');

  try {
    await page.waitForSelector('input#attachCV, input[type="file"], input[name="attachCV"], .updateResume, .uploadBtn, [title*="Update resume" i]', { timeout: 12000 });
  } catch (e) {}

  // 1st priority: direct file input elements
  let fileInput = await page.$('input#attachCV') ||
                  await page.$('input[name="attachCV"]') ||
                  await page.$('input[accept*=".pdf"]') ||
                  await page.$('input[type="file"]');

  // 2nd priority: click "Update resume" button if input is hidden
  if (!fileInput) {
    const updateBtn = await page.$('.updateResume') ||
                      await page.$('.uploadBtn') ||
                      await page.$('[title*="Update resume" i]') ||
                      await page.$('a[href*="attachCV"]') ||
                      await page.$('button.updateResume');
    if (updateBtn) {
      await updateBtn.click();
      await delay(1500);
      fileInput = await page.$('input#attachCV') || await page.$('input[type="file"]');
    }
  }

  // 3rd priority: evaluate handle across document
  if (!fileInput) {
    const inputHandle = await page.evaluateHandle(() => {
      return document.querySelector('#attachCV') ||
             document.querySelector('input[type="file"]') ||
             document.querySelector('input[name="attachCV"]') ||
             document.querySelector('input[accept*="pdf"]');
    });
    if (inputHandle && inputHandle.asElement()) {
      fileInput = inputHandle.asElement();
    }
  }

  if (!fileInput) {
    const currentFinalUrl = page.url();
    const pageTitle = await page.title().catch(() => 'Unknown');
    throw new Error(`Could not locate the resume upload element on Naukri (Page: "${pageTitle}" at ${currentFinalUrl}). Please verify your Naukri session or credentials in the settings tab.`);
  }

  console.log(`[NAUKRI UPLOADER] Uploading resume strictly as ${resumeFileName} (${uploadPdfPath})...`);
  await fileInput.uploadFile(uploadPdfPath);

  // Dispatch change and input events with bubbling to trigger React state updates
  try {
    await page.evaluate(() => {
      const el = document.querySelector('input#attachCV, input[name="attachCV"], input[accept*=".pdf"], input[type="file"]');
      if (el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  } catch (e) {}

  // Check if a modal Save/Upload button is displayed
  try {
    await page.evaluate(() => {
      const saveBtn = document.querySelector('button.saveBtn, button.upload-save, .upload-modal button[type="submit"], button.btn-save');
      if (saveBtn) saveBtn.click();
    });
  } catch (e) {}

  // Wait for Naukri AJAX document upload and processing to finish (6-8 seconds)
  console.log('[NAUKRI UPLOADER] Waiting for Naukri backend AJAX upload processing...');
  await delay(7000);

  const updatedStatusText = await page.evaluate(() => {
    const selectors = ['.updateOn', '.lastUpdated', '.msg', '.success-msg', '.msg-box', '.status-msg', '.toast', '.snackbar', '.server-msg'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim().length > 0) {
        return el.innerText.trim();
      }
    }
    return 'Resume uploaded successfully';
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
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
  // Clear any existing orphaned OTP session before starting a fresh run
  clearActiveOtpSession(userKey);

  const config = getNaukriConfig(userKey);
  const username = overrideOptions.username || config.username;
  const password = overrideOptions.password || config.password;
  const headless = overrideOptions.headless !== undefined ? overrideOptions.headless : (config.headless !== false);

  if (overrideOptions.username || overrideOptions.password) {
    saveNaukriConfig(userKey, {
      username: username || config.username,
      password: password || config.password
    });
  }

  const startTime = Date.now();
  console.log(`[NAUKRI UPLOADER] Starting resume upload workflow for user ${userKey}...`);

  // 1. Generate Fresh 1-Page PDF Resume
  const userResume = getUserResume(userKey);
  if (!userResume) {
    throw new Error('Master resume data not found. Please upload or save your resume first.');
  }

  ensureUserSandbox(userKey);
  const userPaths = getUserPaths(userKey);
  const candidateName = userResume?.personalInfo?.name || 'Candidate';
  const cleanName = candidateName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const resumeFileName = `${cleanName}_resume.pdf`;
  const uploadPdfPath = path.join(userPaths.uploadsDir, resumeFileName);
  await generateResumePdf(userResume, uploadPdfPath);

  // 2. Discover Browser Executable (Windows Chrome or Render Bundled Chromium)
  let browserPath = await ensureBrowserInstalled();
  console.log(`[NAUKRI UPLOADER] Launching browser engine (${browserPath || 'Puppeteer default'})...`);

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
        console.warn('[NAUKRI UPLOADER] Initial launch failed. Running on-demand browser install and retrying...', launchErr.message);
        browserPath = await ensureBrowserInstalled();
        if (browserPath) {
          launchOptions.executablePath = browserPath;
        }
        browser = await puppeteer.launch(launchOptions);
      } else {
        throw launchErr;
      }
    }

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Anti-bot detection stealth scripts
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    // 3. Load Saved User Session Cookies (Google SSO / Session)
    let cookies = [];
    if (fs.existsSync(userPaths.naukriSessionPath)) {
      try {
        cookies = JSON.parse(fs.readFileSync(userPaths.naukriSessionPath, 'utf8'));
      } catch (e) {}
    }
    if ((!cookies || cookies.length === 0) && Array.isArray(config.sessionCookies) && config.sessionCookies.length > 0) {
      cookies = config.sessionCookies;
    }
    if ((!cookies || cookies.length === 0) && isSupabaseConfigured()) {
      try {
        const cloudConf = await supabaseGetNaukriConfig(userKey);
        if (cloudConf && Array.isArray(cloudConf.sessionCookies) && cloudConf.sessionCookies.length > 0) {
          cookies = cloudConf.sessionCookies;
          fs.writeFileSync(userPaths.naukriSessionPath, JSON.stringify(cookies, null, 2), 'utf8');
        }
      } catch (e) {}
    }

    if (Array.isArray(cookies) && cookies.length > 0) {
      for (const c of cookies) {
        if (!c.name || !c.value) continue;
        const dom = c.domain || '.naukri.com';
        try {
          await page.setCookie({
            name: c.name,
            value: c.value,
            domain: dom.startsWith('.') ? dom : `.${dom}`,
            path: c.path || '/'
          });
        } catch (err) {
          try {
            await page.setCookie({
              name: c.name,
              value: c.value,
              domain: 'www.naukri.com',
              path: c.path || '/'
            });
          } catch (e2) {}
        }
      }
      console.log(`[NAUKRI UPLOADER] Injected ${cookies.length} session cookies for user ${userKey}.`);
    }

    // 4. Navigate to Naukri Profile
    console.log('[NAUKRI UPLOADER] Navigating to Naukri Profile page...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await delay(3000);

    // 5. Check if redirected to login page or unauthenticated state
    let currentUrl = page.url();
    let isLoginPage = currentUrl.includes('login') || currentUrl.includes('nlogin') || currentUrl.includes('auth');
    if (!isLoginPage && !currentUrl.includes('mnjuser/profile')) {
      if (currentUrl.includes('naukri.com/homepage') || currentUrl.includes('mynaukri') || currentUrl.includes('naukri.com')) {
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await delay(2000);
        currentUrl = page.url();
        isLoginPage = currentUrl.includes('login') || currentUrl.includes('nlogin') || currentUrl.includes('auth');
      } else {
        isLoginPage = true;
      }
    }
    if (!isLoginPage) {
      const loginField = await page.$('#usernameField, input[type="password"], .loginButton, a[href*="nlogin"]');
      if (loginField) isLoginPage = true;
    }

    if (isLoginPage) {
      console.log(`[NAUKRI UPLOADER] Session not active for user ${userKey}. Attempting credentials authentication...`);
      if (!username || !password) {
        const cfg = getNaukriConfig(userKey);
        cfg.hasSession = false;
        cfg.lastStatus = 'Session Expired / Not Linked';
        saveNaukriConfig(userKey, cfg);

        throw new Error('Naukri session is unauthenticated. Please enter your Naukri username & password in the authorization card, or click "Paste Session Cookie" to connect via your active browser session.');
      }

      if (!currentUrl.includes('login') && !currentUrl.includes('nlogin')) {
        await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await delay(1500);
      }

      await page.waitForSelector('#usernameField, input[placeholder*="Email" i], input[type="email"], input[name="email"]', { timeout: 15000 });
      const userEl = await page.$('#usernameField, input[placeholder*="Email" i], input[type="email"], input[name="email"]');
      await userEl.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await userEl.type(username, { delay: 25 });
      await page.evaluate(() => {
        const u = document.querySelector('#usernameField, input[placeholder*="Email" i], input[type="email"], input[name="email"]');
        if (u) {
          u.dispatchEvent(new Event('input', { bubbles: true }));
          u.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }).catch(() => {});

      await page.waitForSelector('#passwordField, input[type="password"], input[name="password"]', { timeout: 15000 });
      const passEl = await page.$('#passwordField, input[type="password"], input[name="password"]');
      await passEl.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await passEl.type(password, { delay: 25 });
      await page.evaluate(() => {
        const p = document.querySelector('#passwordField, input[type="password"], input[name="password"]');
        if (p) {
          p.dispatchEvent(new Event('input', { bubbles: true }));
          p.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }).catch(() => {});

      await delay(500);

      // Submit login form
      await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"], .btn-primary, .loginButton, button.blueBtn');
        if (btn) btn.click();
      }).catch(() => {});
      await page.keyboard.press('Enter');

      // Poll for up to 20 seconds for session authentication, OTP challenge, or login error
      console.log(`[NAUKRI UPLOADER] Login submitted. Polling for session authentication or OTP challenge...`);
      let loginSuccess = false;
      let detectedOtp = false;

      for (let attempt = 0; attempt < 25; attempt++) {
        await delay(800);

        // 1. Check for on-screen error messages
        const loginErrorText = await page.evaluate(() => {
          const el = document.querySelector('.server-err, .err, .error, .login-error, .errMsg, .error-message, .err-msg, [role="alert"]');
          return el ? el.innerText.trim() : null;
        }).catch(() => null);

        if (loginErrorText && loginErrorText.length > 0 && !loginErrorText.toLowerCase().includes('otp')) {
          throw new Error(`Naukri Login Failed: ${loginErrorText}`);
        }

        // 2. Check for OTP / 2FA challenge screen
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

        // 3. Check for authenticated session cookies or navigation
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
        console.log(`[NAUKRI UPLOADER] 2FA OTP verification required for user ${userKey}. Keeping browser open for user submission...`);
        isOtpWaiting = true;

        // Auto-cleanup timer after 5 minutes if OTP is never submitted
        const timeoutTimer = setTimeout(() => {
          console.log(`[NAUKRI UPLOADER] OTP session timed out after 5 minutes for user ${userKey}. Closing browser...`);
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
      fs.writeFileSync(userPaths.naukriSessionPath, JSON.stringify(sessionCookies, null, 2), 'utf8');
      if (isSupabaseConfigured()) {
        supabaseSaveNaukriConfig(userKey, { sessionCookies, hasSession: true }).catch(() => {});
      }
      console.log(`[NAUKRI UPLOADER] Authentication successful. Session cookies saved for user ${userKey}.`);
    }

    // 6. Perform Resume Upload on Profile Page
    uploadResult = await performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime);

  } catch (err) {
    console.error(`[NAUKRI UPLOADER ERROR for ${userKey}]`, err.message);
    const durationSec = Math.round((Date.now() - startTime) / 1000);

    uploadResult = {
      status: 'error',
      error: err.message,
      duration: `${durationSec}s`,
      timestamp: new Date().toISOString()
    };

    config.lastStatus = 'Failed';
    config.lastError = err.message;
    config.nextUploadAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Retry in 15m
    saveNaukriConfig(userKey, config);

    appendNaukriHistory(userKey, {
      status: 'failed',
      error: err.message,
      duration: `${durationSec}s`
    });

    throw err;
  } finally {
    // Only close browser if NOT currently waiting for user 2FA OTP submission
    if (browser && !isOtpWaiting) {
      try { await browser.close(); } catch (e) {}
    }
  }

  return uploadResult;
}

/**
 * Quarter-Day / Interval Automation Scheduler iterating all active user sandboxes
 */
let naukriSchedulerTimer = null;

function initNaukriScheduler() {
  if (naukriSchedulerTimer) clearInterval(naukriSchedulerTimer);

  console.log('[NAUKRI SCHEDULER] Initialized Quarter-Day (10 AM, 4 PM, 10 PM, 4 AM) multi-user auto-uploader ticker.');

  naukriSchedulerTimer = setInterval(async () => {
    if (!fs.existsSync(USERS_DIR)) return;

    try {
      const userFolders = fs.readdirSync(USERS_DIR);
      for (const userKey of userFolders) {
        const userFolder = path.join(USERS_DIR, userKey);
        if (!fs.statSync(userFolder).isDirectory()) continue;

        const config = getNaukriConfig(userKey);
        if (!config.enabled) continue;

        const paths = getUserPaths(userKey);
        if (!config.username && !fs.existsSync(paths.naukriSessionPath)) continue;

        const now = new Date();
        const nextRun = config.nextUploadAt ? new Date(config.nextUploadAt) : new Date(0);

        if (now >= nextRun) {
          console.log(`[NAUKRI SCHEDULER] Quarter-Day schedule reached for user ${userKey}! Uploading fresh resume...`);
          try {
            await uploadResumeToNaukri(userKey);
            console.log(`[NAUKRI SCHEDULER] Profile refreshed successfully for user ${userKey}.`);
          } catch (e) {
            console.error(`[NAUKRI SCHEDULER ERROR for ${userKey}] Scheduled run failed:`, e.message);
          }
        }
      }
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
    console.log(`[NAUKRI UPLOADER] Submitting 2FA OTP (${otpCode}) for user ${userKey}...`);

    // 1. Wait for any OTP input elements to appear on screen
    try {
      await page.waitForSelector('input[maxlength="1"], input.otpBox, input.otp-digit, input[placeholder*="OTP" i], input[placeholder*="verification" i], input[name*="otp" i], input[id*="otp" i], input[type="tel"]:not(#usernameField)', { timeout: 15000 });
    } catch (e) {}

    // 2. Locate and fill OTP input safely inside the browser context
    const fillResult = await page.evaluate((code) => {
      // Strategy A: 6 individual digit boxes
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

      // Strategy B: Dedicated single OTP text/tel field
      const otpInput = document.querySelector('input[placeholder*="OTP" i], input[placeholder*="verification" i], input[placeholder*="code" i], input[name*="otp" i], input[id*="otp" i], input.otp-input, input[type="tel"]:not(#usernameField), input.otpField, input[data-test*="otp" i]');
      if (otpInput) {
        otpInput.focus();
        otpInput.value = code;
        otpInput.dispatchEvent(new Event('input', { bubbles: true }));
        otpInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'single';
      }

      // Strategy C: query any visible text input not username or password
      const anyInput = Array.from(document.querySelectorAll('input')).find(i => {
        const id = (i.id || '').toLowerCase();
        const name = (i.name || '').toLowerCase();
        const type = (i.type || '').toLowerCase();
        return !id.includes('username') && !id.includes('password') && !name.includes('username') && !name.includes('password') && (type === 'text' || type === 'tel' || type === 'number');
      });
      if (anyInput) {
        anyInput.focus();
        anyInput.value = code;
        anyInput.dispatchEvent(new Event('input', { bubbles: true }));
        anyInput.dispatchEvent(new Event('change', { bubbles: true }));
        return 'any';
      }

      return null;
    }, otpCode).catch(() => null);

    console.log(`[NAUKRI UPLOADER] OTP form filled via strategy: ${fillResult || 'fallback'}`);

    // If evaluate didn't find elements, try typing via Puppeteer keyboard
    if (!fillResult) {
      try {
        const input = await page.$('input[placeholder*="OTP" i], input[type="tel"], input.otp-input, input[name="otp"], input[id*="otp" i]');
        if (input) {
          await input.click({ clickCount: 3 });
          await input.type(otpCode, { delay: 25 });
        }
      } catch (e) {}
    }

    // 3. Submit OTP (Press Enter and Click Verify Button inside evaluate)
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

    // 4. Dynamically poll for authentication success or error message
    console.log('[NAUKRI UPLOADER] Verifying OTP response and waiting for authentication...');
    let isAuthenticated = false;
    let failureReason = null;

    for (let attempt = 0; attempt < 24; attempt++) {
      await delay(600);

      // Check for on-screen OTP error elements safely inside page context
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
      // Check if still stuck on login or OTP page
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('otp')) {
        throw new Error('Naukri did not accept the OTP. Please verify the 6-digit code and try again.');
      }
    }

    console.log(`[NAUKRI UPLOADER] OTP verified successfully for user ${userKey}!`);

    // 5. Auto-dismiss interstitial modals (e.g. "Verify Mobile", "Skip", etc.)
    await dismissNaukriPopups(page);

    // 6. Perform the resume upload
    const uploadResult = await performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime);

    // 7. Clean up OTP session and close browser
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

module.exports = {
  getNextQuarterDayTime,
  calculateNextUploadTime,
  findBrowserExecutable,
  hasValidNaukriSession,
  getNaukriSessionCookies,
  saveNaukriSessionCookies,
  clearNaukriSession,
  getNaukriConfig,
  saveNaukriConfig,
  getNaukriHistory,
  clearNaukriHistory,
  appendNaukriHistory,
  startInteractiveGoogleSsoLogin,
  uploadResumeToNaukri,
  verifyNaukriOtp,
  initNaukriScheduler
};