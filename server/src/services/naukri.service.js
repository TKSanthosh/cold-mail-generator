let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}
const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { getUserResume, getUserPaths, ensureUserSandbox } = require('./user.service');
const {
  isSupabaseConfigured,
  supabaseSaveNaukriConfig,
  supabaseGetNaukriConfig,
  supabaseAppendNaukriHistory,
  supabaseGetNaukriHistory
} = require('./supabase.service');

const USERS_DIR = path.join(__dirname, '../../users');
const activeOtpSessions = new Map();

/**
 * Calculates the next Quarter-Day schedule slot (10:00 AM, 04:00 PM, 10:00 PM, 04:00 AM)
 */
function getNextQuarterDayTime(baseDate = new Date()) {
  const slots = [4, 10, 16, 22]; // 04:00 AM, 10:00 AM, 04:00 PM, 10:00 PM
  for (const slotHour of slots) {
    const candidate = new Date(baseDate);
    candidate.setHours(slotHour, 0, 0, 0);
    if (candidate > baseDate) {
      return candidate;
    }
  }
  const tomorrow = new Date(baseDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(slots[0], 0, 0, 0);
  return tomorrow;
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

  // 2. Linux / Render / Docker paths
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

  // 3. Local & Render .cache/puppeteer recursive search
  const cacheDirs = [
    path.join(__dirname, '../../.cache/puppeteer'),
    path.join(__dirname, '../../../.cache/puppeteer'),
    '/opt/render/project/src/server/.cache/puppeteer',
    '/opt/render/project/src/.cache/puppeteer',
    '/opt/render/.cache/puppeteer',
    process.env.HOME ? path.join(process.env.HOME, '.cache/puppeteer') : null
  ].filter(Boolean);

  for (const cDir of cacheDirs) {
    if (fs.existsSync(cDir)) {
      try {
        const findInDir = (dir) => {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            if (fs.statSync(fullPath).isDirectory()) {
              const res = findInDir(fullPath);
              if (res) return res;
            } else if (entry === 'chrome' || entry === 'chrome.exe') {
              return fullPath;
            }
          }
          return null;
        };
        const found = findInDir(cDir);
        if (found) return found;
      } catch (e) {}
    }
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

function getNaukriConfig(userKey = 'default_user') {
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.naukriConfigPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(paths.naukriConfigPath, 'utf8'));
      return {
        ...saved,
        hasSession: hasValidNaukriSession(userKey)
      };
    } catch (e) {}
  }
  const nextQuarterRun = getNextQuarterDayTime();
  return {
    enabled: true,
    scheduleMode: 'quarter_day',
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: '',
    password: '',
    hasSession: false,
    headless: true,
    lastUploadAt: null,
    nextUploadAt: nextQuarterRun.toISOString(),
    lastStatus: null,
    lastError: null
  };
}

function saveNaukriConfig(userKey = 'default_user', config = {}) {
  ensureUserSandbox(userKey);
  const paths = getUserPaths(userKey);
  const current = getNaukriConfig(userKey);
  const updated = { ...current, ...config };
  fs.writeFileSync(paths.naukriConfigPath, JSON.stringify(updated, null, 2), 'utf8');

  // Supabase Cloud Multi-Device Sync
  if (isSupabaseConfigured()) {
    supabaseSaveNaukriConfig(userKey, updated).catch(() => {});
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
  const browserPath = findBrowserExecutable();
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
    await page.evaluate((el) => {
      if (el) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, fileInput);
  } catch (e) {}

  // Check if a modal Save/Upload button is displayed
  try {
    const saveBtn = await page.$('button.saveBtn, button.upload-save, .upload-modal button[type="submit"], button.btn-save');
    if (saveBtn) {
      await saveBtn.click();
    }
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
  const nextRunDate = (config.scheduleMode === 'quarter_day')
    ? getNextQuarterDayTime()
    : new Date(Date.now() + (config.intervalMinutes || 60) * 60 * 1000);

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
  let browserPath = findBrowserExecutable();
  if (!browserPath && process.platform !== 'win32') {
    try {
      console.log('[NAUKRI UPLOADER] Browser binary not found on Linux container. Auto-installing Chrome on-demand...');
      const { execSync } = require('child_process');
      execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
      browserPath = findBrowserExecutable();
    } catch (e) {
      console.warn('[NAUKRI UPLOADER] On-demand browser install warning:', e.message);
    }
  }
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
        '--single-process',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ],
      defaultViewport: { width: 1280, height: 800 }
    };

    if (browserPath) {
      launchOptions.executablePath = browserPath;
    }

    browser = await puppeteer.launch(launchOptions);

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // 3. Load Saved User Session Cookies (Google SSO / Session)
    if (fs.existsSync(userPaths.naukriSessionPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(userPaths.naukriSessionPath, 'utf8'));
        if (Array.isArray(cookies) && cookies.length > 0) {
          await page.setCookie(...cookies);
          console.log(`[NAUKRI UPLOADER] Restored existing session cookies for user ${userKey}.`);
        }
      } catch (e) {}
    }

    // 4. Navigate to Naukri Profile
    console.log('[NAUKRI UPLOADER] Navigating to Naukri Profile page...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await delay(2500);

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
        throw new Error('Naukri credentials not configured or session expired. Please save your Naukri username & password in the Naukri Booster settings tab or sign in with Google SSO.');
      }

      if (!currentUrl.includes('login') && !currentUrl.includes('nlogin')) {
        await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await delay(1500);
      }

      await page.waitForSelector('#usernameField, input[placeholder*="Email" i], input[type="email"], input[name="email"]', { timeout: 15000 });
      const userEl = await page.$('#usernameField, input[placeholder*="Email" i], input[type="email"], input[name="email"]');
      await userEl.click({ clickCount: 3 });
      await userEl.type(username, { delay: 25 });

      await page.waitForSelector('#passwordField, input[type="password"], input[name="password"]', { timeout: 15000 });
      const passEl = await page.$('#passwordField, input[type="password"], input[name="password"]');
      await passEl.click({ clickCount: 3 });
      await passEl.type(password, { delay: 25 });

      const loginBtn = await page.$('button[type="submit"], .btn-primary, .loginButton');
      if (loginBtn) {
        await loginBtn.click();
        await delay(3500);
      }

      // Check for login errors
      const loginErrorEl = await page.$('.server-err, .err, .error, .login-error, .errMsg');
      if (loginErrorEl) {
        const errorText = await page.evaluate(el => el.innerText.trim(), loginErrorEl);
        if (errorText) {
          throw new Error(`Naukri Login Failed: ${errorText}`);
        }
      }

      currentUrl = page.url();
      const isOtpScreen = currentUrl.includes('otp') ||
                          currentUrl.includes('verification') ||
                          (await page.$('input[placeholder*="OTP" i], input[type="tel"], input.otp-input, input[name="otp"], input[id*="otp" i]'));

      if (isOtpScreen) {
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

    await page.waitForSelector('input[placeholder*="OTP" i], input[type="tel"], input.otp-input, input[name="otp"], input[id*="otp" i], input[type="text"], input[type="number"]', { timeout: 12000 });

    // Handle 6-digit individual box inputs vs single text input
    const digitInputs = await page.$$('input[maxlength="1"], .otp-digit, input.otpBox, input.digit-input, input[id*="otp" i][maxlength="1"]');
    if (digitInputs && digitInputs.length >= 6) {
      const chars = otpCode.split('');
      for (let i = 0; i < Math.min(chars.length, digitInputs.length); i++) {
        await digitInputs[i].click();
        await digitInputs[i].type(chars[i], { delay: 25 });
      }
    } else {
      const otpInput = await page.$('input[placeholder*="OTP" i], input[type="tel"], input.otp-input, input[name="otp"], input[id*="otp" i], input[type="text"], input[type="number"]');
      if (otpInput) {
        await otpInput.click({ clickCount: 3 });
        await otpInput.type(otpCode, { delay: 25 });
      }
    }

    let verifyBtn = await page.$('button[type="submit"], button.btn-primary, button.loginButton, .verifyOtpBtn, button.submitBtn');
    if (!verifyBtn) {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText.toLowerCase(), btn).catch(() => '');
        if (text.includes('verify') || text.includes('submit') || text.includes('continue') || text.includes('login')) {
          verifyBtn = btn;
          break;
        }
      }
    }
    if (verifyBtn) {
      await verifyBtn.click();
      await delay(3500);
    }

    // Check for OTP error messages
    const otpErrorEl = await page.$('.server-err, .err, .error, .login-error, .errMsg, .error-msg, .otp-error');
    if (otpErrorEl) {
      const errText = await page.evaluate(el => el.innerText.trim(), otpErrorEl).catch(() => '');
      if (errText && (errText.toLowerCase().includes('otp') || errText.toLowerCase().includes('invalid') || errText.toLowerCase().includes('expired') || errText.toLowerCase().includes('incorrect'))) {
        throw new Error(`Naukri OTP Verification Failed: ${errText}`);
      }
    }

    // Auto-dismiss interstitial modals (e.g. "Verify Mobile", "Skip", etc.)
    await dismissNaukriPopups(page);

    // Perform the resume upload
    const uploadResult = await performResumeUploadOnPage(page, uploadPdfPath, resumeFileName, userKey, startTime);

    // Clean up OTP session and browser
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
  findBrowserExecutable,
  hasValidNaukriSession,
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