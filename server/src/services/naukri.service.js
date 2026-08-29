let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  puppeteer = require('puppeteer-core');
}
const fs = require('fs');
const path = require('path');
const { generateResumePdf } = require('./pdf.service');
const { getUserResume, getUserPaths } = require('./user.service');
const { isSupabaseConfigured, getSupabaseClient } = require('./supabase.service');

const NAUKRI_CONFIG_FILE = path.join(__dirname, '../../naukri_config.json');
const NAUKRI_SESSION_FILE = path.join(__dirname, '../../naukri_session.json');
const NAUKRI_HISTORY_FILE = path.join(__dirname, '../../naukri_history.json');

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

  // 3. Bundled Puppeteer browser executable if present
  try {
    if (puppeteer && typeof puppeteer.executablePath === 'function') {
      const pPath = puppeteer.executablePath();
      if (pPath && fs.existsSync(pPath)) return pPath;
    }
  } catch (e) {}

  return null;
}

function hasValidNaukriSession() {
  if (fs.existsSync(NAUKRI_SESSION_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(NAUKRI_SESSION_FILE, 'utf8'));
      return Array.isArray(cookies) && cookies.length > 0;
    } catch (e) {}
  }
  return false;
}

function getNaukriConfig() {
  if (fs.existsSync(NAUKRI_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(NAUKRI_CONFIG_FILE, 'utf8'));
    } catch (e) {}
  }
  const nextQuarterRun = getNextQuarterDayTime();
  return {
    enabled: true,
    scheduleMode: 'quarter_day', // 'quarter_day' (10 AM, 4 PM, 10 PM, 4 AM) or 'interval'
    slots: ['10:00 AM', '04:00 PM', '10:00 PM', '04:00 AM'],
    intervalHours: 6,
    intervalMinutes: 360,
    username: '',
    password: '',
    hasSession: hasValidNaukriSession(),
    headless: true,
    lastUploadAt: null,
    nextUploadAt: nextQuarterRun.toISOString(),
    lastStatus: null,
    lastError: null
  };
}

function saveNaukriConfig(config) {
  fs.writeFileSync(NAUKRI_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function getNaukriHistory() {
  if (fs.existsSync(NAUKRI_HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(NAUKRI_HISTORY_FILE, 'utf8'));
    } catch (e) {}
  }
  return [];
}

function appendNaukriHistory(record) {
  const history = getNaukriHistory();
  history.unshift({
    id: `naukri_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    ...record
  });
  fs.writeFileSync(NAUKRI_HISTORY_FILE, JSON.stringify(history.slice(0, 50), null, 2), 'utf8');
}

/**
 * 1-Click Interactive Google SSO Sign-in Helper
 * Opens a visible Chrome browser window to let user click "Sign in with Google".
 * Captures session cookies upon login and saves them to naukri_session.json.
 */
let activeSsoBrowser = null;

async function startInteractiveGoogleSsoLogin() {
  const browserPath = findBrowserExecutable();
  console.log(`[NAUKRI SSO] Launching browser for 1-Click Google SSO login (${browserPath || 'Puppeteer default'})...`);

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
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // Go to Naukri Login Page
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });

  // Wait for user to complete login (either navigation to profile/homepage or cookies created)
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
    }, 180000); // 3 minutes timeout

    checkInterval = setInterval(async () => {
      try {
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
          console.log('[NAUKRI SSO] Google SSO login detected! Saving session cookies...');
          
          // Save all Naukri session cookies
          fs.writeFileSync(NAUKRI_SESSION_FILE, JSON.stringify(cookies, null, 2), 'utf8');

          const config = getNaukriConfig();
          config.hasSession = true;
          config.lastStatus = 'Session Active (Google SSO)';
          saveNaukriConfig(config);

          await cleanup();
          resolve({
            success: true,
            message: 'Google SSO login successful! Session cookies saved for background auto-uploading.'
          });
        }
      } catch (err) {
        // Browser closed manually by user
        if (err.message.includes('Session closed') || err.message.includes('Target closed')) {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (checkInterval) clearInterval(checkInterval);
          activeSsoBrowser = null;
          resolve({
            success: hasValidNaukriSession(),
            message: hasValidNaukriSession() ? 'Session saved successfully.' : 'Browser window was closed.'
          });
        }
      }
    }, 1500);
  });
}

/**
 * Automates logging into Naukri & uploading fresh 1-page PDF resume
 */
async function uploadResumeToNaukri(userKey = 'tksanthosh494_gmail_com', overrideOptions = {}) {
  const config = getNaukriConfig();
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

  const userPaths = getUserPaths(userKey);
  const uploadPdfPath = path.join(userPaths.uploadsDir, 'santhosh_t_k_resume.pdf');
  await generateResumePdf(userResume, uploadPdfPath);

  // 2. Discover Browser Executable (Windows Chrome or Render Bundled Chromium)
  const browserPath = findBrowserExecutable();
  console.log(`[NAUKRI UPLOADER] Launching browser engine (${browserPath || 'Puppeteer default'})...`);

  let browser = null;
  let uploadResult = null;

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

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // 3. Load Saved Session Cookies (Google SSO / Session)
    if (fs.existsSync(NAUKRI_SESSION_FILE)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(NAUKRI_SESSION_FILE, 'utf8'));
        if (Array.isArray(cookies) && cookies.length > 0) {
          await page.setCookie(...cookies);
          console.log('[NAUKRI UPLOADER] Restored existing Google SSO session cookies.');
        }
      } catch (e) {}
    }

    // 4. Navigate to Naukri Profile
    console.log('[NAUKRI UPLOADER] Navigating to Naukri Profile page...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'networkidle2', timeout: 45000 });

    let currentUrl = page.url();

    // 5. If redirected to login page, authenticate
    if (currentUrl.includes('login') || currentUrl.includes('nlogin')) {
      console.log('[NAUKRI UPLOADER] Session not active. Attempting credentials fallback...');
      if (!username || !password) {
        throw new Error('No active session found. Please click "Sign in with Google (1-Click SSO)" in the Naukri tab to connect your account once.');
      }

      await page.waitForSelector('#usernameField, input[placeholder*="Email" i]', { timeout: 15000 });
      await page.type('#usernameField, input[placeholder*="Email" i]', username, { delay: 40 });

      await page.waitForSelector('#passwordField, input[type="password"]', { timeout: 15000 });
      await page.type('#passwordField, input[type="password"]', password, { delay: 40 });

      const loginBtn = await page.$('button[type="submit"], .btn-primary, .loginButton');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      }

      if (page.url().includes('otp') || page.url().includes('verification')) {
        throw new Error('Naukri requested 2FA OTP verification. Please use the "Sign in with Google (1-Click SSO)" button.');
      }

      const sessionCookies = await page.cookies();
      fs.writeFileSync(NAUKRI_SESSION_FILE, JSON.stringify(sessionCookies, null, 2), 'utf8');
      console.log('[NAUKRI UPLOADER] Authentication successful. Session cookies saved.');

      if (!page.url().includes('mnjuser/profile')) {
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'networkidle2', timeout: 30000 });
      }
    }

    // 6. Upload Resume to Profile
    console.log('[NAUKRI UPLOADER] Locating resume upload input element...');
    
    let fileInput = await page.$('input#attachCV') || await page.$('input[type="file"]');
    
    if (!fileInput) {
      const updateBtn = await page.$('.updateResume, .uploadBtn, [title="Update resume"]');
      if (updateBtn) {
        await updateBtn.click();
        await page.waitForTimeout(1000);
        fileInput = await page.$('input[type="file"]');
      }
    }

    if (!fileInput) {
      throw new Error('Could not locate the resume upload button (#attachCV) on Naukri profile page.');
    }

    console.log(`[NAUKRI UPLOADER] Uploading resume strictly as santhosh_t_k_resume.pdf (${uploadPdfPath})...`);
    await fileInput.uploadFile(uploadPdfPath);

    await page.waitForTimeout(4000);

    const updatedStatusText = await page.evaluate(() => {
      const el = document.querySelector('.updateOn, .lastUpdated, .msg, .success-msg');
      return el ? el.innerText.trim() : 'Resume uploaded successfully';
    });

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`[NAUKRI UPLOADER] SUCCESS! Profile refreshed in ${durationSec}s as santhosh_t_k_resume.pdf. Status: ${updatedStatusText}`);

    uploadResult = {
      status: 'success',
      fileName: 'santhosh_t_k_resume.pdf',
      message: 'Resume updated successfully on Naukri profile as santhosh_t_k_resume.pdf (Active Just Now)',
      duration: `${durationSec}s`,
      timestamp: new Date().toISOString(),
      profileStatus: updatedStatusText
    };

    const nextRunDate = (config.scheduleMode === 'quarter_day')
      ? getNextQuarterDayTime()
      : new Date(Date.now() + (config.intervalMinutes || 60) * 60 * 1000);

    config.hasSession = true;
    config.lastUploadAt = new Date().toISOString();
    config.lastStatus = 'Success';
    config.lastError = null;
    config.nextUploadAt = nextRunDate.toISOString();
    saveNaukriConfig(config);

    appendNaukriHistory({
      status: 'success',
      fileName: 'santhosh_t_k_resume.pdf',
      message: 'Resume refreshed on Naukri as santhosh_t_k_resume.pdf (Active Just Now)',
      duration: `${durationSec}s`,
      profileStatus: updatedStatusText
    });

  } catch (err) {
    console.error('[NAUKRI UPLOADER ERROR]', err.message);
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
    saveNaukriConfig(config);

    appendNaukriHistory({
      status: 'failed',
      error: err.message,
      duration: `${durationSec}s`
    });

    throw err;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }

  return uploadResult;
}

/**
 * Quarter-Day / Interval Automation Scheduler
 */
let naukriSchedulerTimer = null;

function initNaukriScheduler() {
  if (naukriSchedulerTimer) clearInterval(naukriSchedulerTimer);

  console.log('[NAUKRI SCHEDULER] Initialized Quarter-Day (10 AM, 4 PM, 10 PM, 4 AM) auto-uploader ticker.');

  naukriSchedulerTimer = setInterval(async () => {
    const config = getNaukriConfig();
    if (!config.enabled) return;

    if (!config.username && !fs.existsSync(NAUKRI_SESSION_FILE)) return;

    const now = new Date();
    const nextRun = config.nextUploadAt ? new Date(config.nextUploadAt) : new Date(0);

    if (now >= nextRun) {
      console.log('[NAUKRI SCHEDULER] Quarter-Day schedule slot reached! Uploading fresh resume to Naukri...');
      try {
        await uploadResumeToNaukri('tksanthosh494_gmail_com');
        console.log('[NAUKRI SCHEDULER] Profile refreshed successfully.');
      } catch (e) {
        console.error('[NAUKRI SCHEDULER ERROR] Scheduled run failed:', e.message);
      }
    }
  }, 30000); // Check every 30s
}

module.exports = {
  getNextQuarterDayTime,
  findBrowserExecutable,
  hasValidNaukriSession,
  getNaukriConfig,
  saveNaukriConfig,
  getNaukriHistory,
  startInteractiveGoogleSsoLogin,
  uploadResumeToNaukri,
  initNaukriScheduler
};