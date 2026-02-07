/**
 * Symmetric key encryption/decryption for API keys in transit.
 * Uses AES-256-CBC with a salt derived from an environment variable.
 * Both frontend and backend share the same salt via VITE_API_KEY_SALT.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Derive a 32-byte key from the salt string using SHA-256.
 */
const deriveKey = (salt) => {
    return crypto.createHash('sha256').update(salt).digest();
};

/**
 * Get the salt from environment, falling back to a default.
 * The default is only for development — production should set VITE_API_KEY_SALT.
 */
const getSalt = () => {
    return process.env.VITE_API_KEY_SALT || process.env.API_KEY_SALT || 'synthlabs-rg-default-salt-change-me';
};

/**
 * Encrypt a plaintext string.
 * Returns: base64 string of `iv:encrypted`
 */
export const encryptKey = (plaintext) => {
    const salt = getSalt();
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return `${iv.toString('base64')}:${encrypted}`;
};

/**
 * Decrypt a string that was encrypted with encryptKey.
 * Input: base64 string of `iv:encrypted`
 */
export const decryptKey = (ciphertext) => {
    const salt = getSalt();
    const key = deriveKey(salt);
    const [ivBase64, encrypted] = ciphertext.split(':');
    if (!ivBase64 || !encrypted) {
        throw new Error('Invalid encrypted key format');
    }
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};
