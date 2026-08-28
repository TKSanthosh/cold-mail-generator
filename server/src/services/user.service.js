const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const USERS_DIR = path.join(__dirname, '../../users');
const MASTER_RESUME_PATH = path.join(__dirname, '../../resume.json');
const SECRET_PATH = process.env.GOOGLE_CLIENT_SECRET_PATH;

if (!fs.existsSync(USERS_DIR)) {
  fs.mkdirSync(USERS_DIR, { recursive: true });
}

function getUserKeyFromEmail(email) {
  if (!email || typeof email !== 'string') return 'default_user';
  return email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

const { readCompressedJson, writeCompressedJson, createFullBackup, restoreFullBackup, appendGlobalLog, getGlobalLogs } = require('./storage.service');
const {
  isSupabaseConfigured,
  supabaseUpsertUser,
  supabaseGetUser,
  supabaseSaveResume,
  supabaseGetResume,
  supabaseAppendLog,
  supabaseGetLogs,
  supabaseSaveApplications,
  supabaseGetApplications
} = require('./supabase.service');

function getUserPaths(userKey) {
  const key = userKey || 'default_user';
  const userDir = path.join(USERS_DIR, key);
  const uploadsDir = path.join(userDir, 'uploads');

  return {
    userDir,
    uploadsDir,
    tokenPath: path.join(userDir, 'token.json'),
    profilePath: path.join(userDir, 'profile.json'),
    resumePath: path.join(userDir, 'resume.json'),
    applicationsPath: path.join(userDir, 'applications.json'),
    applicationsPathGz: path.join(userDir, 'applications.json.gz'),
    logsPath: path.join(userDir, 'logs.json'),
    logsPathGz: path.join(userDir, 'logs.json.gz'),
    scheduledPath: path.join(userDir, 'scheduled.json')
  };
}

function ensureUserSandbox(userKey, profileInfo = {}) {
  const paths = getUserPaths(userKey);

  if (!fs.existsSync(paths.userDir)) {
    fs.mkdirSync(paths.userDir, { recursive: true });
  }
  if (!fs.existsSync(paths.uploadsDir)) {
    fs.mkdirSync(paths.uploadsDir, { recursive: true });
  }

  // 1. Profile metadata
  if (!fs.existsSync(paths.profilePath) || profileInfo.email) {
    let existingProfile = {};
    if (fs.existsSync(paths.profilePath)) {
      try { existingProfile = JSON.parse(fs.readFileSync(paths.profilePath, 'utf8')); } catch (e) {}
    }
    const profile = {
      userKey,
      email: profileInfo.email || existingProfile.email || '',
      name: profileInfo.name || existingProfile.name || 'Candidate',
      picture: profileInfo.picture || existingProfile.picture || '',
      createdAt: existingProfile.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    fs.writeFileSync(paths.profilePath, JSON.stringify(profile, null, 2), 'utf8');
  }

  // 2. Base Resume
  if (!fs.existsSync(paths.resumePath)) {
    const isSanthosh = userKey.includes('santhosh') || (profileInfo.email && profileInfo.email.includes('santhosh'));
    if (isSanthosh && fs.existsSync(MASTER_RESUME_PATH)) {
      fs.copyFileSync(MASTER_RESUME_PATH, paths.resumePath);
    } else {
      const starterResume = {
        personalInfo: {
          name: profileInfo.name || "Candidate Name",
          title: "Software Development Engineer",
          location: "Bangalore",
          email: profileInfo.email || "",
          phone: "+91 ",
          portfolio: "",
          linkedin: "linkedin.com/in/",
          github: "github.com/"
        },
        summary: "Software Development Engineer with experience in designing and developing scalable web applications using modern full-stack technologies.",
        skills: {
          "Backend Technologies": ["Node.js", "Express.js", "RESTful APIs"],
          "Frontend Technologies": ["React.js", "JavaScript (ES6+)", "HTML5", "CSS3"],
          "Databases": ["MySQL", "MongoDB"],
          "Tools & Platforms": ["Git", "GitHub", "Postman", "npm"]
        },
        experience: [],
        achievements: [],
        internship: null,
        education: []
      };
      fs.writeFileSync(paths.resumePath, JSON.stringify(starterResume, null, 2), 'utf8');
    }
  }

  return paths;
}

function getUserProfile(userKey) {
  const paths = getUserPaths(userKey);
  if (fs.existsSync(paths.profilePath)) {
    try {
      return JSON.parse(fs.readFileSync(paths.profilePath, 'utf8'));
    } catch (e) {}
  }
  return null;
}

function getUserResume(userKey) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  try {
    return JSON.parse(fs.readFileSync(paths.resumePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveUserResume(userKey, data) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  fs.writeFileSync(paths.resumePath, JSON.stringify(data, null, 2), 'utf8');

  // Supabase cloud sync
  if (isSupabaseConfigured()) {
    supabaseSaveResume(userKey, data).catch(() => {});
  }
}

function getUserApplications(userKey) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  return readCompressedJson(paths.applicationsPathGz, paths.applicationsPath, []);
}

function saveUserApplications(userKey, apps) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  writeCompressedJson(paths.applicationsPathGz, paths.applicationsPath, apps);

  // Supabase cloud sync
  if (isSupabaseConfigured()) {
    supabaseSaveApplications(userKey, apps).catch(() => {});
  }
}

function getUserLogs(userKey) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  return readCompressedJson(paths.logsPathGz, paths.logsPath, []);
}

function addUserLog(userKey, entry) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  try {
    const logItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      userKey: userKey || 'default',
      ...entry
    };
    const logs = getUserLogs(userKey);
    logs.unshift(logItem);
    writeCompressedJson(paths.logsPathGz, paths.logsPath, logs);

    // Also persist into global server compressed archive
    appendGlobalLog(logItem);

    // Supabase cloud sync
    if (isSupabaseConfigured()) {
      supabaseAppendLog(userKey, logItem).catch(() => {});
    }
  } catch (e) {
    console.error('Failed to add user log:', e);
  }
}

function syncUserLogs(userKey, clientLogs = []) {
  const serverLogs = getUserLogs(userKey);
  const logMap = new Map();

  // Combine client and server records by unique ID or timestamp+email
  [...clientLogs, ...serverLogs].forEach(log => {
    if (!log) return;
    const key = log.id || `${log.timestamp}_${log.email || log.hrEmail || ''}`;
    if (!logMap.has(key)) {
      logMap.set(key, log);
    }
  });

  const mergedLogs = Array.from(logMap.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  writeCompressedJson(paths.logsPathGz, paths.logsPath, mergedLogs);
  return mergedLogs;
}

function syncUserApplications(userKey, clientApps = []) {
  const serverApps = getUserApplications(userKey);
  const appMap = new Map();

  [...clientApps, ...serverApps].forEach(app => {
    if (!app) return;
    const key = app.id || `${app.timestamp}_${app.company || ''}_${app.role || ''}`;
    if (!appMap.has(key)) {
      appMap.set(key, app);
    }
  });

  const mergedApps = Array.from(appMap.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  writeCompressedJson(paths.applicationsPathGz, paths.applicationsPath, mergedApps);
  return mergedApps;
}

function getUserOAuthClient(userKey) {
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (process.env.GOOGLE_CLIENT_SECRET_JSON) {
      try {
        const parsed = JSON.parse(process.env.GOOGLE_CLIENT_SECRET_JSON);
        const keyType = parsed.installed ? 'installed' : 'web';
        clientId = parsed[keyType].client_id;
        clientSecret = parsed[keyType].client_secret;
      } catch (e) {}
    } else if (SECRET_PATH && fs.existsSync(SECRET_PATH)) {
      const credentials = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
      const keyType = credentials.installed ? 'installed' : 'web';
      clientId = credentials[keyType].client_id;
      clientSecret = credentials[keyType].client_secret;
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured.');
  }

  const base = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5001';
  const redirectUri = `${base.replace(/\/$/, '')}/api/auth/callback`;

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const paths = getUserPaths(userKey);
  const globalTokenPath = path.join(__dirname, '../../token.json');

  if (fs.existsSync(paths.tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(paths.tokenPath, 'utf8'));
      client.setCredentials(tokens);
    } catch (e) {}
  } else if (fs.existsSync(globalTokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(globalTokenPath, 'utf8'));
      client.setCredentials(tokens);
      fs.copyFileSync(globalTokenPath, paths.tokenPath);
    } catch (e) {}
  }

  return client;
}

function isUserAuthorized(userKey) {
  try {
    const paths = getUserPaths(userKey);
    const globalTokenPath = path.join(__dirname, '../../token.json');

    if (!fs.existsSync(paths.tokenPath)) {
      if (fs.existsSync(globalTokenPath)) {
        try {
          fs.copyFileSync(globalTokenPath, paths.tokenPath);
          const tokens = JSON.parse(fs.readFileSync(paths.tokenPath, 'utf8'));
          return !!(tokens && (tokens.access_token || tokens.refresh_token));
        } catch (e) {}
      }
      return false;
    }
    const tokens = JSON.parse(fs.readFileSync(paths.tokenPath, 'utf8'));
    return !!(tokens && (tokens.access_token || tokens.refresh_token));
  } catch (e) {
    return false;
  }
}

function listAllProfiles() {
  if (!fs.existsSync(USERS_DIR)) return [];
  const entries = fs.readdirSync(USERS_DIR, { withFileTypes: true });
  const profiles = [];

  entries.forEach(entry => {
    if (entry.isDirectory()) {
      const pPath = path.join(USERS_DIR, entry.name, 'profile.json');
      if (fs.existsSync(pPath)) {
        try {
          const profile = JSON.parse(fs.readFileSync(pPath, 'utf8'));
          profile.isAuthorized = isUserAuthorized(entry.name);
          profiles.push(profile);
        } catch (e) {}
      }
    }
  });

  return profiles;
}

module.exports = {
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
  getUserOAuthClient,
  isUserAuthorized,
  listAllProfiles,
  USERS_DIR,
  createFullBackup,
  restoreFullBackup
};
