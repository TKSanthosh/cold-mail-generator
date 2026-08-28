const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { getUserKeyFromEmail, ensureUserSandbox, getUserPaths, getUserOAuthClient, isUserAuthorized } = require('./user.service');

const SECRET_PATH = process.env.GOOGLE_CLIENT_SECRET_PATH;
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, '../../token.json');

// Scopes required for sending emails & user profile info
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

let globalOAuth2ClientInstance = null;

function getOAuth2Client() {
  if (globalOAuth2ClientInstance) {
    return globalOAuth2ClientInstance;
  }

  if (!SECRET_PATH || !fs.existsSync(SECRET_PATH)) {
    throw new Error(`Google Client Secret JSON not found at: ${SECRET_PATH}`);
  }

  const credentials = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
  const keyType = credentials.installed ? 'installed' : 'web';
  const { client_id, client_secret } = credentials[keyType];
  const redirectUri = 'http://localhost:5001/api/auth/callback';

  globalOAuth2ClientInstance = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      globalOAuth2ClientInstance.setCredentials(token);
    } catch (e) {}
  }

  return globalOAuth2ClientInstance;
}

function getAuthUrl(state = '') {
  const o2Client = getOAuth2Client();
  return o2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: state || ''
  });
}

async function handleCallbackCode(code) {
  const o2Client = getOAuth2Client();
  const { tokens } = await o2Client.getToken(code);
  o2Client.setCredentials(tokens);
  
  // Also save to global token for backward compatibility
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');

  // Fetch Google User Profile (email, name, picture)
  const oauth2 = google.oauth2({ version: 'v2', auth: o2Client });
  const userInfoRes = await oauth2.userinfo.get();
  const { email, name, picture } = userInfoRes.data;

  const userKey = getUserKeyFromEmail(email);
  const userPaths = ensureUserSandbox(userKey, { email, name, picture });

  // Save tokens inside user's private sandbox
  fs.writeFileSync(userPaths.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');

  return {
    userKey,
    email,
    name: name || 'Candidate',
    picture: picture || '',
    tokens
  };
}

function isAuthorized(userKey) {
  if (userKey) {
    return isUserAuthorized(userKey);
  }
  try {
    const o2Client = getOAuth2Client();
    const creds = o2Client.credentials;
    return !!(creds && (creds.access_token || creds.refresh_token));
  } catch (e) {
    return false;
  }
}

function logout(userKey) {
  if (userKey) {
    const paths = getUserPaths(userKey);
    if (fs.existsSync(paths.tokenPath)) {
      try { fs.unlinkSync(paths.tokenPath); } catch (e) {}
    }
  } else {
    if (fs.existsSync(TOKEN_PATH)) {
      try { fs.unlinkSync(TOKEN_PATH); } catch (e) {}
    }
    if (globalOAuth2ClientInstance) {
      globalOAuth2ClientInstance.setCredentials({});
    }
  }
}

module.exports = {
  getOAuth2Client,
  getAuthUrl,
  handleCallbackCode,
  isAuthorized,
  logout
};
