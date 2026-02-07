/**
 * Server-Sent Events (SSE) helper utilities for streaming AI responses
 */

/**
 * Setup SSE response headers and return helper methods
 * @param {import('express').Response} res - Express response object
 * @returns {{ send: (event: string, data: any) => boolean, ping: () => boolean, close: () => void, isOpen: () => boolean }}
 */
export const setupSSE = (res) => {
    const startTime = Date.now();
    const log = (msg, ...args) => console.log(`[SSE +${Date.now() - startTime}ms]`, msg, ...args);

    log('Setting up SSE connection...');

    // Disable timeouts for long-running SSE connections
    if (typeof res.setTimeout === 'function') {
        res.setTimeout(0);
        log('Disabled response timeout');
    }
    if (res.socket && typeof res.socket.setTimeout === 'function') {
        res.socket.setTimeout(0);
        log('Disabled socket timeout');
    }
    if (res.socket) {
        res.socket.setNoDelay(true); // Disable Nagle algorithm for immediate writes
        res.socket.setKeepAlive(true, 30000); // Enable TCP keep-alive with 30s interval
        log('Configured socket: noDelay=true, keepAlive=true');
    }

    // Set SSE-specific headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    res.setHeader('Access-Control-Allow-Origin', '*'); // CORS for SSE

    log('Headers set, flushing...');
    res.flushHeaders();

    // Send initial comment to establish connection and verify write works
    const writeResult = res.write(': connected\n\n');
    log('Initial write result:', writeResult, 'writableEnded:', res.writableEnded, 'headersSent:', res.headersSent);

    // Track connection state
    let eventsSent = 0;
    let bytesSent = 0;

    const helper = {
        /**
         * Check if the connection is still open
         */
        isOpen: () => !res.writableEnded && !res.destroyed,

        /**
         * Send an SSE event
         * @param {string} event - Event name (e.g., 'chunk', 'done', 'error')
         * @param {any} data - Data to send (will be JSON stringified)
         * @returns {boolean} true if write succeeded
         */
        send: (event, data) => {
            try {
                if (res.writableEnded) {
                    log('Cannot write event - response already ended');
                    return false;
                }
                if (res.destroyed) {
                    log('Cannot write event - response destroyed');
                    return false;
                }
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                const writeOk = res.write(message);
                eventsSent++;
                bytesSent += message.length;
                if (eventsSent <= 3 || eventsSent % 10 === 0) {
                    log(`Sent event #${eventsSent} type=${event} (${message.length} bytes), writeOk=${writeOk}`);
                }
                return writeOk;
            } catch (err) {
                log('Error writing event:', err.message);
                return false;
            }
        },

        /**
         * Send a comment (for keep-alive)
         * @returns {boolean} true if write succeeded
         */
        ping: () => {
            try {
                if (res.writableEnded) {
                    log('Cannot ping - response already ended');
                    return false;
                }
                if (res.destroyed) {
                    log('Cannot ping - response destroyed');
                    return false;
                }
                const writeOk = res.write(': ping\n\n');
                return writeOk;
            } catch (err) {
                log('Error writing ping:', err.message);
                return false;
            }
        },

        /**
         * Close the SSE connection
         */
        close: () => {
            log(`Closing connection. Total events: ${eventsSent}, bytes: ${bytesSent}`);
            try {
                if (!res.writableEnded && !res.destroyed) {
                    res.end();
                }
            } catch (err) {
                log('Error closing:', err.message);
            }
        },

        /**
         * Get connection stats
         */
        getStats: () => ({ eventsSent, bytesSent, duration: Date.now() - startTime }),
    };

    return helper;
};

/**
 * SSE event types for AI streaming
 */
export const SSEEventTypes = {
    CHUNK: 'chunk',      // Streaming content chunk
    DONE: 'done',        // Stream completed successfully
    ERROR: 'error',      // Error occurred
    USAGE: 'usage',      // Token usage update
    TOOL_CALL: 'tool_call', // Tool call detected
};

/**
 * Error codes for SSE error events
 */
export const SSEErrorCodes = {
    INVALID_API_KEY: 'INVALID_API_KEY',
    PROVIDER_ERROR: 'PROVIDER_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    TIMEOUT: 'TIMEOUT',
    PARSE_ERROR: 'PARSE_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    CANCELLED: 'CANCELLED',
    INVALID_REQUEST: 'INVALID_REQUEST',
};

/**
 * Create an error payload for SSE
 * @param {string} code - Error code from SSEErrorCodes
 * @param {string} message - Human-readable error message
 * @param {boolean} retryable - Whether the client should retry
 * @param {object} details - Additional error details
 */
export const createErrorPayload = (code, message, retryable = false, details = {}) => ({
    code,
    message,
    retryable,
    details,
    timestamp: Date.now(),
});
