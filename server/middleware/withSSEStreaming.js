/**
 * Unified SSE streaming wrapper for AI endpoints
 *
 * This module provides a consistent pattern for all SSE streaming endpoints,
 * handling connection setup, keep-alive pings, abort/cleanup, and error handling.
 */

import { setupSSE, SSEEventTypes, SSEErrorCodes, createErrorPayload } from './sseHelpers.js';

/**
 * Configuration for the SSE streaming wrapper
 * @typedef {Object} SSEStreamConfig
 * @property {string} name - Endpoint name for logging (e.g., 'chat', 'rewrite')
 * @property {number} [pingIntervalMs=500] - Keep-alive ping interval in milliseconds
 * @property {number} [initialPingDelayMs=50] - Delay between initial pings
 */

/**
 * Context passed to the streaming handler
 * @typedef {Object} SSEStreamContext
 * @property {Object} sse - SSE helper with send, ping, close methods
 * @property {AbortController} abortController - Controller for aborting the stream
 * @property {Function} isAborted - Check if stream was aborted
 * @property {Function} logWithTime - Timestamped logging function
 * @property {Function} onChunk - Standard chunk handler that checks abort and sends SSE
 */

/**
 * Creates a unified SSE streaming handler
 *
 * @param {SSEStreamConfig} config - Configuration for the streaming endpoint
 * @param {Function} handler - Async function that performs the actual streaming
 *   Receives (req, res, context: SSEStreamContext) and should return the final result
 *   or throw an error
 * @returns {Function} Express middleware function
 *
 * @example
 * ```js
 * app.post('/api/ai/chat/stream', withSSEStreaming(
 *   { name: 'chat' },
 *   async (req, res, ctx) => {
 *     const { apiKey, model, messages } = req.body;
 *
 *     const result = await streamChatCompletion({
 *       // ... config
 *       signal: ctx.abortController.signal,
 *       onChunk: (chunk, accumulated, reasoning, usage) => {
 *         return ctx.onChunk({ chunk, accumulated, reasoning, usage });
 *       }
 *     });
 *
 *     return { success: true, result };
 *   }
 * ));
 * ```
 */
export const withSSEStreaming = (config, handler) => {
    const {
        name,
        pingIntervalMs = 500,
        initialPingDelayMs = 50,
    } = config;

    return async (req, res) => {
        const startTime = Date.now();
        const logWithTime = (msg, ...args) =>
            console.log(`[${name}/stream +${Date.now() - startTime}ms]`, msg, ...args);

        logWithTime('Received request');

        // Set up SSE connection
        logWithTime('Before SSE setup - res.writableEnded:', res.writableEnded, 'res.headersSent:', res.headersSent);

        const sse = setupSSE(res);

        logWithTime('After SSE setup - res.writableEnded:', res.writableEnded, 'res.destroyed:', res.destroyed);

        // Track abort state
        let aborted = false;
        const abortController = new AbortController();

        // Send immediate pings to establish connection (critical for browser SSE)
        logWithTime('Sending initial pings to establish connection...');
        sse.ping();

        // Wait a tiny bit to let the connection settle
        await new Promise(r => setTimeout(r, initialPingDelayMs));
        sse.ping();

        // Keep-alive ping interval
        let pingCount = 2; // Already sent 2 pings above
        let keepAliveInterval = setInterval(() => {
            if (!aborted && !res.writableEnded && !res.destroyed) {
                pingCount++;
                if (pingCount <= 10 || pingCount % 20 === 0) {
                    logWithTime(`Sending keep-alive ping #${pingCount}`);
                }
                sse.ping();
            } else {
                // Connection is dead — auto-cleanup the interval
                logWithTime(`Cleaning up ping interval - aborted:${aborted}, writableEnded:${res.writableEnded}, destroyed:${res.destroyed}`);
                cleanup();
            }
        }, pingIntervalMs);

        const cleanup = () => {
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
        };

        const handleDisconnect = (source) => {
            if (aborted) return; // Already handled
            logWithTime(`${source} - setting aborted=true`);
            aborted = true;
            abortController.abort();
            cleanup();
        };

        // Event listeners — only req events should trigger abort (reliable client disconnect).
        // res.on('close') can fire prematurely with chunked encoding and must NOT abort.
        req.on('close', () => handleDisconnect('Client disconnected (req close)'));

        req.on('error', (err) => {
            logWithTime('Request error:', err.message);
            handleDisconnect('Request error');
        });

        res.on('error', (err) => {
            logWithTime('Response error:', err.message);
        });

        res.on('close', () => {
            logWithTime('Response close event');
            cleanup(); // Stop pings, but do NOT abort — res close can fire during normal operation
        });

        res.on('finish', () => {
            logWithTime('Response finish event');
        });

        // Context object passed to the handler
        let chunkCount = 0;
        const context = {
            sse,
            abortController,
            isAborted: () => aborted,
            logWithTime,

            /**
             * Standard chunk handler - checks abort state and sends SSE event
             * @param {Object} data - Chunk data to send
             * @returns {boolean} - false if aborted, true otherwise
             */
            onChunk: (data) => {
                chunkCount++;
                if (chunkCount <= 3 || chunkCount % 10 === 0) {
                    logWithTime(`onChunk #${chunkCount}, chunk len: ${data.chunk?.length || 0}, accumulated len: ${data.accumulated?.length || 0}`);
                }

                if (aborted) {
                    logWithTime('onChunk - returning false because aborted');
                    return false;
                }

                sse.send(SSEEventTypes.CHUNK, data);
                return true;
            },

            /**
             * Send a custom SSE event
             */
            sendEvent: (eventType, data) => {
                if (aborted) return false;
                sse.send(eventType, data);
                return true;
            },
        };

        try {
            // Call the handler
            const result = await handler(req, res, context);

            logWithTime('Handler completed, total chunks:', chunkCount);

            if (aborted) {
                logWithTime('Aborted after completion, not sending done event');
                return;
            }

            // Send done event with the result
            logWithTime('Sending DONE event');
            sse.send(SSEEventTypes.DONE, result);

        } catch (error) {
            logWithTime('Caught error:', error.message, 'aborted:', aborted);

            if (aborted) {
                logWithTime('Aborted, not sending error event');
                return;
            }

            console.error(`[${name}/stream] Error:`, error.message);

            // Determine error code and retryability
            let code = SSEErrorCodes.PROVIDER_ERROR;
            let retryable = true;

            if (error.name === 'AbortError') {
                code = SSEErrorCodes.CANCELLED;
                retryable = false;
            } else if (error.status === 401 || error.status === 403) {
                code = SSEErrorCodes.INVALID_API_KEY;
                retryable = false;
            } else if (error.status === 429) {
                code = SSEErrorCodes.RATE_LIMITED;
                retryable = true;
            } else if (error.status >= 400 && error.status < 500) {
                retryable = false;
            }

            sse.send(SSEEventTypes.ERROR, createErrorPayload(
                code,
                error.message,
                retryable,
                { status: error.status }
            ));
        } finally {
            cleanup();
            sse.close();
        }
    };
};

/**
 * Helper to create a validation error response before SSE is established
 * Use this for required field validation before calling withSSEStreaming handler
 */
export const validateRequired = (res, fields) => {
    for (const [name, value] of Object.entries(fields)) {
        if (!value) {
            res.status(400).json({ error: `${name} is required` });
            return false;
        }
    }
    return true;
};

/**
 * Helper to validate field is one of allowed values
 */
export const validateEnum = (res, fieldName, value, allowedValues) => {
    if (!allowedValues.includes(value)) {
        res.status(400).json({ error: `${fieldName} must be one of: ${allowedValues.join(', ')}` });
        return false;
    }
    return true;
};

export { SSEEventTypes, SSEErrorCodes };
