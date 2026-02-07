/**
 * Symmetric key encryption for API keys sent to the backend.
 * Uses AES-CBC with a salt from VITE_API_KEY_SALT environment variable.
 * Mirrors server/utils/keyEncryption.js using the Web Crypto API.
 */

const ALGORITHM = 'AES-CBC';
const IV_LENGTH = 16;

const getSalt = (): string => {
    return import.meta.env.VITE_API_KEY_SALT || 'synthlabs-rg-default-salt-change-me';
};

/**
 * Derive a 256-bit key from the salt string using SHA-256.
 */
const deriveKey = async (salt: string): Promise<CryptoKey> => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest('SHA-256', encoder.encode(salt));
    return crypto.subtle.importKey('raw', keyMaterial, { name: ALGORITHM }, false, [
        'encrypt',
    ]);
};

/**
 * Encrypt a plaintext API key.
 * Returns: base64 string of `iv:encrypted` (same format as the backend).
 */
export const encryptKey = async (plaintext: string): Promise<string> => {
    const salt = getSalt();
    const key = await deriveKey(salt);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoder.encode(plaintext)
    );
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const encryptedBase64 = btoa(
        String.fromCharCode(...new Uint8Array(encrypted))
    );
    return `${ivBase64}:${encryptedBase64}`;
};
