const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cold_email_super_secret_jwt_key_2026_!@#_santhosh';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cold_email_super_refresh_jwt_key_2026_!@#_santhosh';

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
