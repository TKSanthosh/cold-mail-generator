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
    logsPath: path.join(userDir, 'logs.json'),
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

  // 3. Applications Log
  if (!fs.existsSync(paths.applicationsPath)) {
    fs.writeFileSync(paths.applicationsPath, JSON.stringify([], null, 2), 'utf8');
  }

  // 4. Outreach Logs
  if (!fs.existsSync(paths.logsPath)) {
    fs.writeFileSync(paths.logsPath, JSON.stringify([], null, 2), 'utf8');
  }

  // 5. Scheduled Jobs
  if (!fs.existsSync(paths.scheduledPath)) {
    fs.writeFileSync(paths.scheduledPath, JSON.stringify([], null, 2), 'utf8');
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
}

function getUserApplications(userKey) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  try {
    return JSON.parse(fs.readFileSync(paths.applicationsPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveUserApplications(userKey, apps) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  fs.writeFileSync(paths.applicationsPath, JSON.stringify(apps, null, 2), 'utf8');
}

function getUserLogs(userKey) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  try {
    return JSON.parse(fs.readFileSync(paths.logsPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function addUserLog(userKey, entry) {
  const paths = getUserPaths(userKey);
  ensureUserSandbox(userKey);
  try {
    let logs = [];
    if (fs.existsSync(paths.logsPath)) {
      logs = JSON.parse(fs.readFileSync(paths.logsPath, 'utf8'));
    }
    logs.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...entry
    });
    fs.writeFileSync(paths.logsPath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to add user log:', e);
  }
}

function getUserOAuthClient(userKey) {
  if (!SECRET_PATH || !fs.existsSync(SECRET_PATH)) {
    throw new Error(`Google Client Secret JSON not found at: ${SECRET_PATH}`);
  }

  const credentials = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
  const keyType = credentials.installed ? 'installed' : 'web';
  const { client_id, client_secret } = credentials[keyType];
  const redirectUri = 'http://localhost:5001/api/auth/callback';

  const client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
  const paths = getUserPaths(userKey);

  if (fs.existsSync(paths.tokenPath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(paths.tokenPath, 'utf8'));
      client.setCredentials(tokens);
    } catch (e) {}
  }

  return client;
}

function isUserAuthorized(userKey) {
  try {
    const paths = getUserPaths(userKey);
    if (!fs.existsSync(paths.tokenPath)) return false;
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
  getUserLogs,
  addUserLog,
  getUserOAuthClient,
  isUserAuthorized,
  listAllProfiles
};
