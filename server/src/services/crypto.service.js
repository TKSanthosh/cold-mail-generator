const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const LEGACY_KEY_SEED = 'cold-reach-secure-vault-key-2026';

function resolveEncryptionSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true' || process.env.USE_TEST_DATABASE === 'true') {
      return 'test_secure_encryption_secret_minimum_32_chars_12345';
    }
    console.warn('\n======================================================');
    console.warn('[SECURITY WARNING] ENCRYPTION_SECRET is not configured or shorter than 32 chars in cloud environment.');
    console.warn('Please add ENCRYPTION_SECRET to your Render/cloud dashboard environment variables.');
    console.warn('Using auto-fallback vault key to prevent server crash.');
    console.warn('======================================================\n');
    return process.env.ENCRYPTION_SECRET_FALLBACK || 'cold-reach-secure-vault-key-2026-production-fallback-key-32ch';
  }
  return secret.trim();
}

const SECRET_SEED = resolveEncryptionSecret();
const KEY = crypto.createHash('sha256').update(SECRET_SEED).digest();
const LEGACY_KEY = crypto.createHash('sha256').update(LEGACY_KEY_SEED).digest();

/**
 * Encrypts plain text string using AES-256-GCM
 */
function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  if (text.startsWith('enc:v1:')) return text; // Already encrypted

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[CRYPTO ERROR] Failed to encrypt text:', err.message);
    throw new Error(`[CRYPTO ERROR] Encryption failure: ${err.message}`);
  }
}

/**
 * Decrypts AES-256-GCM encrypted string with automatic legacy key fallback recovery
 */
function decryptText(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  if (!cipherText.startsWith('enc:v1:')) return cipherText; // Plain text fallback

  const parts = cipherText.split(':');
  if (parts.length !== 5) {
    throw new Error('[CRYPTO ERROR] Malformed encrypted payload structure.');
  }

  const iv = Buffer.from(parts[2], 'hex');
  const tag = Buffer.from(parts[3], 'hex');
  const encrypted = parts[4];

  // 1. Attempt decryption with primary active key
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // 2. Attempt fallback recovery with legacy seed if different
    if (SECRET_SEED !== LEGACY_KEY_SEED) {
      try {
        const legacyDecipher = crypto.createDecipheriv(ALGORITHM, LEGACY_KEY, iv);
        legacyDecipher.setAuthTag(tag);
        let legacyDecrypted = legacyDecipher.update(encrypted, 'hex', 'utf8');
        legacyDecrypted += legacyDecipher.final('utf8');
        console.log('[CRYPTO MIGRATION] Decrypted record using legacy key. Recommend saving to rotate.');
        return legacyDecrypted;
      } catch (legacyErr) {
        // Both primary and legacy decryption failed
      }
    }

    console.error('[CRYPTO ERROR] Decryption authentication failed (tampered data or invalid key):', err.message);
    throw new Error(`[CRYPTO ERROR] Decryption failed: ${err.message}`);
  }
}

/**
 * Encrypts an object/array into an encrypted string
 */
function encryptData(data) {
  if (data === null || data === undefined) return data;
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    return encryptText(jsonStr);
  } catch (e) {
    throw new Error(`[CRYPTO ERROR] Failed to serialize data for encryption: ${e.message}`);
  }
}

/**
 * Decrypts an encrypted string into its original object/array/string
 */
function decryptData(data) {
  if (!data) return data;
  if (typeof data !== 'string') return data;
  if (!data.startsWith('enc:v1:')) return data;

  try {
    const decryptedStr = decryptText(data);
    try {
      return JSON.parse(decryptedStr);
    } catch (e) {
      return decryptedStr;
    }
  } catch (e) {
    console.error('[CRYPTO ERROR] Failed to decrypt data payload:', e.message);
    throw e;
  }
}

module.exports = {
  encryptText,
  decryptText,
  encryptData,
  decryptData
};

