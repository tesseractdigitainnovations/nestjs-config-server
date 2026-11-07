import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for config values.
 *
 * A value is stored as `ENC(<base64 of iv + ciphertext + authTag>)` and decrypted when
 * the document is served, so secrets can live in a git-tracked `.env.*` file without
 * being readable there. AES-256-GCM, so a tampered value fails to decrypt rather than
 * returning garbage.
 *
 * The key comes from `CONFIG_ENCRYPTION_KEY` (64 hex characters). No key means
 * encryption is off and documents pass through untouched - enable the key BEFORE
 * encrypting anything, or the server serves `ENC(...)` strings as if they were values.
 *
 * `scripts/config-crypto.mjs` is the companion CLI (generate-key / encrypt / decrypt /
 * rekey) and uses the same format.
 */

export type ConfigDocument = Record<string, unknown>;

const ENC_PREFIX = 'ENC(';
const ENC_SUFFIX = ')';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const isEncryptedValue = (value: string): boolean =>
  value.startsWith(ENC_PREFIX) && value.endsWith(ENC_SUFFIX);

/** Encrypt a plaintext string, returning `ENC(<base64>)`. */
export const encryptValue = (plaintext: string, key: Buffer): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${Buffer.concat([iv, encrypted, tag]).toString('base64')}${ENC_SUFFIX}`;
};

/** Decrypt an `ENC(...)` value. Throws on a wrong key or tampered ciphertext. */
export const decryptValue = (encoded: string, key: Buffer): string => {
  if (!isEncryptedValue(encoded)) {
    throw new Error('Value is not an ENC() wrapper');
  }

  const packed = Buffer.from(
    encoded.slice(ENC_PREFIX.length, -ENC_SUFFIX.length),
    'base64',
  );

  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error('ENC() payload too short to contain iv + tag + ciphertext');
  }

  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(packed.length - TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES, packed.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    'utf8',
  );
};

/**
 * Decrypt every `ENC(...)` value in a document.
 *
 * - `key === null`: encryption disabled, document returned unchanged.
 * - Any failure throws, so a half-decrypted document is never served.
 */
export const decryptDocument = (
  doc: ConfigDocument,
  key: Buffer | null,
): ConfigDocument => {
  if (!key) return doc;

  const result: ConfigDocument = {};
  for (const [k, v] of Object.entries(doc)) {
    if (typeof v === 'string' && isEncryptedValue(v)) {
      try {
        result[k] = decryptValue(v, key);
      } catch (error) {
        throw new Error(`Failed to decrypt config key '${k}'`, {
          cause: error,
        });
      }
    } else {
      result[k] = v;
    }
  }
  return result;
};

/**
 * Parse the hex key, or return `null` when unset.
 *
 * Length is checked here so a truncated key fails at boot, not at the first decrypt.
 */
export const parseEncryptionKey = (hex: string | undefined): Buffer | null => {
  if (!hex) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `CONFIG_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars), got ${buf.length} bytes`,
    );
  }
  return buf;
};
