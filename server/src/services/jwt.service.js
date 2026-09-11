const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

function resolveJwtSecret(varName, testDefault) {
  const val = process.env[varName];
  if (!val || val.trim().length < 16) {
    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || process.env.USE_TEST_DATABASE === 'true') {
      return testDefault;
    }
    console.warn(`[SECURITY WARNING] ${varName} is not set in environment. Using fallback key. Configure ${varName} in cloud environment.`);
    return `${varName.toLowerCase()}_fallback_key_production_32_chars_long`;
  }
  return val.trim();
}

const JWT_SECRET = resolveJwtSecret('JWT_SECRET', 'test_jwt_access_secret_1234567890_key');
const JWT_REFRESH_SECRET = resolveJwtSecret('JWT_REFRESH_SECRET', 'test_jwt_refresh_secret_1234567890_key');

// 30 Days in seconds
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60;

/**
 * Generates an Access Token and a 30-day Refresh Token for the user.
 */
function generateTokens(payload) {
  const userPayload = {
    userKey: payload.userKey,
    email: payload.email,
    name: payload.name || 'Candidate',
    picture: payload.picture || ''
  };

  // Access token valid for 30 days
  const accessToken = jwt.sign(userPayload, JWT_SECRET, {
    expiresIn: '30d'
  });

  // Refresh token valid for 60 days
  const refreshToken = jwt.sign({ userKey: payload.userKey, email: payload.email }, JWT_REFRESH_SECRET, {
    expiresIn: '60d'
  });

  return { accessToken, refreshToken, expiresIn: ONE_MONTH_SECONDS };
}

/**
 * Verifies and decodes a JWT access token.
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Verifies a refresh token and creates a fresh access token.
 */
function verifyRefreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    return decoded;
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  ONE_MONTH_SECONDS
};

