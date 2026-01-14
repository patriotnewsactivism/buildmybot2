/**
 * Encryption utilities for sensitive data (API keys, credentials)
 * Uses AES-256-GCM for encryption
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get encryption key from environment
 * Falls back to SESSION_SECRET if ENCRYPTION_KEY not set
 */
function getEncryptionKey(): string {
  return process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key-change-me';
}

/**
 * Derive a key from the master key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  const masterKey = getEncryptionKey();
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * Encrypt a string
 * Returns base64-encoded string: salt:iv:tag:ciphertext
 */
export function encrypt(text: string): string {
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from salt
  const key = deriveKey(salt);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get auth tag
  const tag = cipher.getAuthTag();

  // Combine: salt:iv:tag:ciphertext
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted,
  ].join(':');
}

/**
 * Decrypt a string
 * Expects base64-encoded format from encrypt()
 */
export function decrypt(encryptedText: string): string {
  // Parse components
  const parts = encryptedText.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted text format');
  }

  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encrypted = parts[3];

  // Derive key
  const key = deriveKey(salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash a string (one-way, for passwords)
 */
export function hash(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(
    text,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );

  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a hashed string
 */
export function verifyHash(text: string, hashedText: string): boolean {
  const [saltHex, hashHex] = hashedText.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = crypto.pbkdf2Sync(
    text,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );

  return hash.toString('hex') === hashHex;
}

/**
 * Generate a random token (for API keys, session tokens)
 */
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
