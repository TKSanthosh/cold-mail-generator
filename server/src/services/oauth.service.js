const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SECRET_PATH = process.env.GOOGLE_CLIENT_SECRET_PATH;
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, '../../token.json');

// Scopes required for sending emails
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
];

let oauth2ClientInstance = null;

function getOAuth2Client() {
  if (oauth2ClientInstance) {
    return oauth2ClientInstance;
  }

  if (!SECRET_PATH || !fs.existsSync(SECRET_PATH)) {
    throw new Error(`Google Client Secret JSON not found at: ${SECRET_PATH}`);
  }

  const credentials = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf8'));
  const keyType = credentials.installed ? 'installed' : 'web';
  const { client_id, client_secret } = credentials[keyType];
  
  // We use localhost port 5001 for callback redirect
  const redirectUri = 'http://localhost:5001/api/auth/callback';

  oauth2ClientInstance = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  // Load existing token if available
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2ClientInstance.setCredentials(token);
  }

  return oauth2ClientInstance;
}

function getAuthUrl() {
  const o2Client = getOAuth2Client();
  return o2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces refresh token generation
  });
}

async function handleCallbackCode(code) {
  const o2Client = getOAuth2Client();
  const { tokens } = await o2Client.getToken(code);
  o2Client.setCredentials(tokens);
  
  // Save tokens for persistence (includes refresh token if offline is used)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  return tokens;
}

function isAuthorized() {
  try {
    const o2Client = getOAuth2Client();
    const creds = o2Client.credentials;
    return !!(creds && (creds.access_token || creds.refresh_token));
  } catch (e) {
    return false;
  }
}

function logout() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  if (oauth2ClientInstance) {
    oauth2ClientInstance.setCredentials({});
  }
}

module.exports = {
  getOAuth2Client,
  getAuthUrl,
  handleCallbackCode,
  isAuthorized,
  logout
};
