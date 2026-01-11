/**
 * Development-only logger utility.
 * Wraps console methods to only output when in development mode OR when verbose logging is enabled.
 * The verbose flag can be set dynamically at runtime.
 */

// Static env check for debug mode
const isEnvDev = import.meta.env.DEV || import.meta.env.VITE_DEBUG_MODE === 'true';

// Dynamic verbose flag that can be toggled at runtime
let isVerbose = isEnvDev;

/**
 * Enable or disable verbose logging at runtime.
 * When the app is in "production" mode (UI toggle), call setVerbose(false) to silence logs.
 * When in "development" mode (UI toggle), call setVerbose(true) to enable logs.
 */
export const setVerbose = (enabled: boolean) => {
    isVerbose = enabled;
};

/**
 * Check if verbose logging is currently enabled.
 */
export const isVerboseEnabled = () => isVerbose;

export const logger = {
    log: (...args: any[]) => {
        if (isVerbose) console.log(...args);
    },
    warn: (...args: any[]) => {
        if (isVerbose) console.warn(...args);
    },
    error: (...args: any[]) => {
        // Errors are always logged
        console.error(...args);
    },
    group: (label: string) => {
        if (isVerbose) console.group(label);
    },
    groupCollapsed: (label: string) => {
        if (isVerbose) console.groupCollapsed(label);
    },
    groupEnd: () => {
        if (isVerbose) console.groupEnd();
    }
};
