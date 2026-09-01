import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const configured = process.env.ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('ENCRYPTION_KEY is required for telephony credentials');
  }
  return createHash('sha256').update(configured, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error('Cannot encrypt an empty secret');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue, extra] =
    String(payload || '').split(':');
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra
  ) {
    throw new Error('Unsupported encrypted credential format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
