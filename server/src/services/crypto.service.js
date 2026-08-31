const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SECRET_SEED = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'cold-reach-secure-vault-key-2026';
const KEY = crypto.createHash('sha256').update(SECRET_SEED).digest();

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
    console.error('[CRYPTO ERROR] Failed to encrypt:', err.message);
    return text;
  }
}

/**
 * Decrypts AES-256-GCM encrypted string
 */
function decryptText(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  if (!cipherText.startsWith('enc:v1:')) return cipherText; // Plain text fallback

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const iv = Buffer.from(parts[2], 'hex');
    const tag = Buffer.from(parts[3], 'hex');
    const encrypted = parts[4];

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.warn('[CRYPTO WARN] Failed to decrypt (corrupted or wrong key), returning raw string:', err.message);
    return cipherText;
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
    return data;
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
    return data;
  }
}

module.exports = {
  encryptText,
  decryptText,
  encryptData,
  decryptData
};
