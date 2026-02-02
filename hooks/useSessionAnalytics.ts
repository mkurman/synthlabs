import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionData, SessionAnalytics } from '../types';
import { StorageMode } from '../interfaces/enums/StorageMode';
import * as IndexedDBUtils from '../services/session/indexedDBUtils';

interface UseSessionAnalyticsOptions {
    session: SessionData | null;
    items: any[]; // Current items (logs) to analyze
    enabled?: boolean;
    cacheTTL?: number; // Cache time-to-live in milliseconds (default: 5 minutes)
    autoUpdate?: boolean; // Auto-update analytics when items change
}

interface AnalyticsMetrics {
    totalTokens: number;
    totalCost: number;
    avgResponseTime: number;
    successRate: number;
}

/**
 * Hook for tracking and caching session analytics
 */
export function useSessionAnalytics(options: UseSessionAnalyticsOptions) {
    const {
        session,
        items,
        enabled = true,
        cacheTTL = 5 * 60 * 1000, // 5 minutes default
        autoUpdate = true
    } = options;

    const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);

    // Cache timestamp
    const lastCalculatedRef = useRef<number>(0);
    const cacheTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Check if cache is valid
     */
    const isCacheValid = useCallback(() => {
        if (!lastCalculatedRef.current) return false;
        const elapsed = Date.now() - lastCalculatedRef.current;
        return elapsed < cacheTTL;
    }, [cacheTTL]);

    /**
     * Calculate analytics from items
     */
    const calculateAnalytics = useCallback((itemsToAnalyze: any[]): SessionAnalytics => {
        const totalItems = itemsToAnalyze.length;

        // Count completed items (items with a final status)
        const completedItems = itemsToAnalyze.filter(item =>
            item.status === 'completed' ||
            item.status === 'success' ||
            item.output ||
            item.reasoning
        ).length;

        // Count errors
        const errorCount = itemsToAnalyze.filter(item =>
            item.status === 'error' ||
            item.status === 'failed' ||
            item.error
        ).length;

        // Calculate token usage
        const totalTokens = itemsToAnalyze.reduce((sum, item) => {
            return sum + (item.tokens || item.usage?.total_tokens || 0);
        }, 0);

        // Calculate cost
        const totalCost = itemsToAnalyze.reduce((sum, item) => {
            return sum + (item.cost || item.usage?.cost || 0);
        }, 0);

        // Calculate average response time
        const responseTimes = itemsToAnalyze
            .map(item => item.responseTime || item.duration || 0)
            .filter(time => time > 0);

        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;

        // Calculate success rate
        const successRate = totalItems > 0
            ? (completedItems / totalItems) * 100
            : 0;

        return {
            totalItems,
            completedItems,
            errorCount,
            totalTokens,
            totalCost,
            avgResponseTime,
            successRate,
            lastUpdated: Date.now()
        };
    }, []);

    /**
     * Update analytics (with caching)
     */
    const updateAnalytics = useCallback(async (force: boolean = false) => {
        if (!session || !enabled) return;

        // Check cache validity
        if (!force && isCacheValid()) {
            return; // Use cached analytics
        }

        setIsCalculating(true);
        try {
            // Calculate new analytics
            const newAnalytics = calculateAnalytics(items);

            // Update state
            setAnalytics(newAnalytics);
            lastCalculatedRef.current = Date.now();

            // Save to storage
            if (session.storageMode === StorageMode.Local) {
                await IndexedDBUtils.updateSessionAnalytics(session.id, newAnalytics);
            } else {
                // Save to Firebase (to be implemented)
                // For now, fall back to local
                await IndexedDBUtils.updateSessionAnalytics(session.id, newAnalytics);
            }
        } catch (error) {
            console.error('Failed to update analytics:', error);
        } finally {
            setIsCalculating(false);
        }
    }, [session, enabled, items, calculateAnalytics, isCacheValid]);

    /**
     * Force refresh analytics (bypass cache)
     */
    const refreshAnalytics = useCallback(async () => {
        await updateAnalytics(true);
    }, [updateAnalytics]);

    /**
     * Get current analytics (from state or calculate fresh)
     */
    const getCurrentAnalytics = useCallback((): SessionAnalytics => {
        if (analytics && isCacheValid()) {
            return analytics;
        }
        return calculateAnalytics(items);
    }, [analytics, items, calculateAnalytics, isCacheValid]);

    /**
     * Get specific metrics
     */
    const getMetrics = useCallback((): AnalyticsMetrics => {
        const current = getCurrentAnalytics();
        return {
            totalTokens: current.totalTokens,
            totalCost: current.totalCost,
            avgResponseTime: current.avgResponseTime,
            successRate: current.successRate
        };
    }, [getCurrentAnalytics]);

    // Auto-update analytics when items change
    useEffect(() => {
        if (!autoUpdate || !session || !enabled) return;

        // Clear existing timer
        if (cacheTimerRef.current) {
            clearTimeout(cacheTimerRef.current);
        }

        // Debounce updates (wait 1 second after last change)
        cacheTimerRef.current = setTimeout(() => {
            updateAnalytics(false);
        }, 1000);

        return () => {
            if (cacheTimerRef.current) {
                clearTimeout(cacheTimerRef.current);
            }
        };
    }, [items.length, session, enabled, autoUpdate, updateAnalytics]);

    // Load cached analytics on mount
    useEffect(() => {
        if (!session || !enabled) return;

        // Use session's existing analytics if available
        if (session.analytics) {
            setAnalytics(session.analytics);
            lastCalculatedRef.current = session.analytics.lastUpdated;
        } else {
            // Calculate initial analytics
            updateAnalytics(true);
        }
    }, [session?.id, enabled]); // Only run when session changes

    return {
        // State
        analytics: analytics || getCurrentAnalytics(),
        isCalculating,
        isCacheValid: isCacheValid(),

        // Actions
        updateAnalytics,
        refreshAnalytics,
        getMetrics,

        // Helpers
        getCacheAge: () => Date.now() - lastCalculatedRef.current,
        getNextUpdateIn: () => Math.max(0, cacheTTL - (Date.now() - lastCalculatedRef.current))
    };
}
