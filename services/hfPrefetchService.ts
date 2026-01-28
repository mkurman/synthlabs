/**
 * HuggingFace Prefetch Service
 * Manages intelligent prefetching of HuggingFace dataset rows to avoid 429 rate limit errors.
 *
 * Key features:
 * - Prefetches data in batches based on concurrency settings
 * - Monitors buffer consumption and triggers refetch at configurable threshold
 * - Dynamically adjusts to concurrency changes
 * - HF API limits: max 100 rows per request
 */

import { HuggingFaceConfig } from '../types';
import { fetchHuggingFaceRows } from './huggingFaceService';
import { logger } from '../utils/logger';

// HuggingFace API limits: max 100 rows per request
// This constant documents the API limit but prefetch size is calculated based on concurrency
export const HF_MAX_BATCH_SIZE = 100;

export interface PrefetchConfig {
    /** Number of batches to prefetch (default: 10) */
    prefetchBatches: number;
    /** Threshold percentage (0-1) at which to trigger next fetch (default: 0.3 = 30%) */
    prefetchThreshold: number;
}

export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = {
    prefetchBatches: 10,
    prefetchThreshold: 0.3
};

export interface PrefetchState {
    /** Current buffer of prefetched rows */
    buffer: any[];
    /** Current offset in the HF dataset (next row to fetch) */
    currentOffset: number;
    /** Total rows requested by user */
    totalRequested: number;
    /** Total rows already delivered to workers */
    totalDelivered: number;
    /** Whether we've reached the end of requested data */
    isComplete: boolean;
    /** Whether a fetch is currently in progress */
    isFetching: boolean;
    /** Current concurrency setting */
    concurrency: number;
    /** Prefetch configuration */
    config: PrefetchConfig;
}

export type PrefetchCallback = (state: PrefetchState) => void;

/**
 * HuggingFace Prefetch Manager
 * Manages a buffer of prefetched rows and triggers refetches based on consumption
 */
export class HFPrefetchManager {
    private state: PrefetchState;
    private hfConfig: HuggingFaceConfig;
    private abortController: AbortController | null = null;
    private onStateChange: PrefetchCallback | null = null;
    private fetchPromise: Promise<void> | null = null;

    constructor(
        hfConfig: HuggingFaceConfig,
        skipRows: number,
        totalRequested: number,
        concurrency: number,
        prefetchConfig: PrefetchConfig = DEFAULT_PREFETCH_CONFIG
    ) {
        this.hfConfig = hfConfig;
        this.state = {
            buffer: [],
            currentOffset: skipRows,
            totalRequested,
            totalDelivered: 0,
            isComplete: false,
            isFetching: false,
            concurrency,
            config: prefetchConfig
        };
    }

    /**
     * Set callback for state changes (useful for UI updates)
     */
    setOnStateChange(callback: PrefetchCallback | null): void {
        this.onStateChange = callback;
    }

    /**
     * Calculate how many rows to prefetch based on concurrency
     * Formula: prefetchBatches * concurrency, but respect HF batch limit
     */
    private calculatePrefetchSize(): number {
        const { concurrency, config, totalRequested, totalDelivered } = this.state;
        const remaining = totalRequested - totalDelivered;

        // Base prefetch: prefetchBatches * concurrency
        // This ensures we have enough data for all workers
        const basePrefetch = config.prefetchBatches * concurrency;

        // Don't fetch more than remaining
        return Math.min(basePrefetch, remaining);
    }

    /**
     * Calculate the threshold at which we should start fetching more
     */
    private getRefetchThreshold(): number {
        const { concurrency, config } = this.state;
        // Threshold: when buffer drops to config.prefetchThreshold of ideal size
        const idealSize = config.prefetchBatches * concurrency;
        return Math.floor(idealSize * config.prefetchThreshold);
    }

    /**
     * Check if we should trigger a prefetch
     */
    private shouldPrefetch(): boolean {
        const { buffer, isComplete, isFetching, totalDelivered, totalRequested } = this.state;

        // Don't fetch if we're already fetching or complete
        if (isFetching || isComplete) return false;

        // Don't fetch if we've delivered all requested rows
        if (totalDelivered >= totalRequested) return false;

        // Fetch if buffer is below threshold
        const threshold = this.getRefetchThreshold();
        return buffer.length <= threshold;
    }

    /**
     * Perform initial prefetch - call this before starting workers
     */
    async initialPrefetch(): Promise<void> {
        logger.log('[HFPrefetch] Starting initial prefetch...');
        await this.triggerPrefetch();
    }

    /**
     * Trigger a prefetch operation
     */
    private async triggerPrefetch(): Promise<void> {
        if (this.state.isFetching) {
            // Wait for existing fetch to complete
            if (this.fetchPromise) {
                await this.fetchPromise;
            }
            return;
        }

        const prefetchSize = this.calculatePrefetchSize();
        if (prefetchSize <= 0) {
            this.state.isComplete = true;
            this.notifyStateChange();
            return;
        }

        this.state.isFetching = true;
        this.notifyStateChange();

        logger.log(`[HFPrefetch] Fetching ${prefetchSize} rows from offset ${this.state.currentOffset}`);

        this.fetchPromise = (async () => {
            try {
                const rows = await fetchHuggingFaceRows(
                    this.hfConfig,
                    this.state.currentOffset,
                    prefetchSize
                );

                // Add to buffer
                this.state.buffer.push(...rows);
                this.state.currentOffset += rows.length;

                logger.log(`[HFPrefetch] Fetched ${rows.length} rows, buffer size: ${this.state.buffer.length}`);

                // Check if we've fetched fewer rows than requested (end of dataset)
                if (rows.length < prefetchSize) {
                    this.state.isComplete = true;
                    logger.log('[HFPrefetch] Reached end of available data');
                }
            } catch (err: any) {
                logger.error('[HFPrefetch] Fetch error:', err);
                throw err;
            } finally {
                this.state.isFetching = false;
                this.fetchPromise = null;
                this.notifyStateChange();
            }
        })();

        await this.fetchPromise;
    }

    /**
     * Get next item from buffer for a worker
     * Returns null if no more items available
     */
    async getNextItem(): Promise<any | null> {
        // Check if we need to prefetch more
        if (this.shouldPrefetch()) {
            // Trigger prefetch in background
            this.triggerPrefetch().catch(err => {
                logger.error('[HFPrefetch] Background prefetch error:', err);
            });
        }

        // Wait for fetch if buffer is empty but not complete
        while (this.state.buffer.length === 0 && !this.state.isComplete) {
            if (this.state.isFetching && this.fetchPromise) {
                await this.fetchPromise;
            } else if (this.shouldPrefetch()) {
                await this.triggerPrefetch();
            } else {
                break;
            }
        }

        // Check if we've delivered all requested
        if (this.state.totalDelivered >= this.state.totalRequested) {
            return null;
        }

        // Get from buffer
        if (this.state.buffer.length > 0) {
            const item = this.state.buffer.shift();
            this.state.totalDelivered++;
            this.notifyStateChange();

            // Check again if we need to prefetch after delivering
            if (this.shouldPrefetch()) {
                this.triggerPrefetch().catch(err => {
                    logger.error('[HFPrefetch] Post-delivery prefetch error:', err);
                });
            }

            return item;
        }

        // Buffer empty and complete
        return null;
    }

    /**
     * Update concurrency setting (called when user changes it during generation)
     */
    updateConcurrency(newConcurrency: number): void {
        const oldConcurrency = this.state.concurrency;
        this.state.concurrency = newConcurrency;
        logger.log(`[HFPrefetch] Concurrency changed: ${oldConcurrency} -> ${newConcurrency}`);

        // Check if we need to prefetch more due to increased concurrency
        if (this.shouldPrefetch()) {
            this.triggerPrefetch().catch(err => {
                logger.error('[HFPrefetch] Concurrency adjustment prefetch error:', err);
            });
        }

        this.notifyStateChange();
    }

    /**
     * Update prefetch configuration
     */
    updateConfig(config: Partial<PrefetchConfig>): void {
        this.state.config = { ...this.state.config, ...config };
        logger.log('[HFPrefetch] Config updated:', this.state.config);

        // Check if we need to prefetch more due to config change
        if (this.shouldPrefetch()) {
            this.triggerPrefetch().catch(err => {
                logger.error('[HFPrefetch] Config update prefetch error:', err);
            });
        }

        this.notifyStateChange();
    }

    /**
     * Get current state (for monitoring/UI)
     */
    getState(): Readonly<PrefetchState> {
        return { ...this.state };
    }

    /**
     * Abort any pending fetches
     */
    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.state.isFetching = false;
        this.fetchPromise = null;
    }

    /**
     * Reset the manager for a new run
     */
    reset(skipRows: number, totalRequested: number): void {
        this.abort();
        this.state = {
            buffer: [],
            currentOffset: skipRows,
            totalRequested,
            totalDelivered: 0,
            isComplete: false,
            isFetching: false,
            concurrency: this.state.concurrency,
            config: this.state.config
        };
        this.notifyStateChange();
    }

    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }
}

/**
 * Create a prefetch manager instance
 */
export function createPrefetchManager(
    hfConfig: HuggingFaceConfig,
    skipRows: number,
    totalRequested: number,
    concurrency: number,
    prefetchConfig?: PrefetchConfig
): HFPrefetchManager {
    return new HFPrefetchManager(
        hfConfig,
        skipRows,
        totalRequested,
        concurrency,
        prefetchConfig
    );
}
