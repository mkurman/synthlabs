/**
 * Backend configuration persistence.
 *
 * Stores provider settings in a JSON file (.backend-config.json) so the backend
 * remembers chosen DB provider, connection strings, etc. across restarts.
 * Sensitive values (connection strings, certs) are encrypted at rest using
 * the same AES-256 encryption as API keys.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptKey, decryptKey } from './keyEncryption.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', '..', '.backend-config.json');

/** Fields that should be encrypted at rest */
const SENSITIVE_FIELDS = ['connectionString', 'caCertPem'];

/**
 * Encrypt sensitive fields in a config object before writing to disk.
 */
const encryptSensitiveFields = (config) => {
    const result = { ...config };
    for (const field of SENSITIVE_FIELDS) {
        if (result[field]) {
            result[field] = encryptKey(result[field]);
            result[`${field}__encrypted`] = true;
        }
    }
    return result;
};

/**
 * Decrypt sensitive fields after reading from disk.
 */
const decryptSensitiveFields = (config) => {
    const result = { ...config };
    for (const field of SENSITIVE_FIELDS) {
        if (result[`${field}__encrypted`] && result[field]) {
            try {
                result[field] = decryptKey(result[field]);
            } catch (e) {
                console.warn(`[backendConfig] Failed to decrypt ${field}, ignoring:`, e.message);
                delete result[field];
            }
            delete result[`${field}__encrypted`];
        }
    }
    return result;
};

/**
 * Load the persisted backend config from disk.
 * Returns null if no config file exists.
 * @returns {Object|null}
 */
export const loadConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return null;
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(raw);
        return decryptSensitiveFields(config);
    } catch (e) {
        console.warn('[backendConfig] Failed to load config:', e.message);
        return null;
    }
};

/**
 * Save backend config to disk with sensitive fields encrypted.
 * @param {Object} config
 */
export const saveConfig = (config) => {
    try {
        const encrypted = encryptSensitiveFields(config);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(encrypted, null, 2), 'utf-8');
        console.log('[backendConfig] Config saved to', CONFIG_PATH);
    } catch (e) {
        console.warn('[backendConfig] Failed to save config:', e.message);
    }
};

/**
 * Update specific fields in the persisted config (merge with existing).
 * @param {Object} updates
 */
export const updateConfig = (updates) => {
    const existing = loadConfig() || {};
    const merged = { ...existing, ...updates };
    saveConfig(merged);
    return merged;
};

/**
 * Get a specific field from the persisted config.
 * @param {string} key
 * @param {*} defaultValue
 */
export const getConfigValue = (key, defaultValue = undefined) => {
    const config = loadConfig();
    return config?.[key] ?? defaultValue;
};
