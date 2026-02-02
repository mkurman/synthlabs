import { getDbStats, fetchAllLogs } from './firebaseService';
import { logger } from '../utils/logger';

export interface AnalyticMetric {
    label: string;
    value: number | string;
    trend?: number; // percentage change
    trendLabel?: string;
    color?: string;
}

export interface SessionAnalytics {
    totalLogs: number;
    averageScore: number;
    averageDuration: number;
    tokenUsage: number;
    topModel: string;
    successRate: number; // Percentage of non-discarded items
}

class SessionAnalyticsService {
    /**
     * Load analytics for a specific session.
     * This might involve aggregating data from logs.
     * For now, we calculate from fetched logs or use stats API.
     */
    async loadSessionAnalytics(sessionUid: string): Promise<SessionAnalytics> {
        try {
            // For lightweight stats, we might want a specific aggregation in Firebase.
            // But for now, we'll fetch logs (maybe with a limit) or use stats.
            // fetchAllLogs might be heavy if session is huge. 
            // Ideally we should have aggregated stats in the session document or calculate periodically.

            // We will perform client-side calculation on limited set or full set if needed.
            // Let's assume we fetch all logs for this session to compute accurate analytics.
            const logs = await fetchAllLogs(2000, sessionUid); // Limit to 2000 for performance safety

            if (logs.length === 0) {
                return {
                    totalLogs: 0,
                    averageScore: 0,
                    averageDuration: 0,
                    tokenUsage: 0,
                    topModel: 'N/A',
                    successRate: 0
                };
            }

            const totalLogs = logs.length;
            const totalScore = logs.reduce((sum, log) => sum + (log.score || 0), 0);
            const totalDuration = logs.reduce((sum, log) => sum + ((log as any).duration || 0), 0);
            const totalTokens = logs.reduce((sum, log) => sum + ((log as any).tokenCount || 0), 0);

            // Model usage
            const modelCounts: Record<string, number> = {};
            logs.forEach(log => {
                const model = (log as any).modelUsed || 'unknown';
                modelCounts[model] = (modelCounts[model] || 0) + 1;
            });
            const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

            // Success rate (assuming score > 0 is success or not discarded)
            // Actually success rate in Verifier usually pertains to valid vs invalid.
            // If we don't have explicit "valid" flag, we use score.
            const validLogs = logs.filter(l => l.score > 0).length;

            return {
                totalLogs,
                averageScore: totalLogs > 0 ? totalScore / totalLogs : 0,
                averageDuration: totalLogs > 0 ? totalDuration / totalLogs : 0,
                tokenUsage: totalTokens,
                topModel,
                successRate: totalLogs > 0 ? (validLogs / totalLogs) * 100 : 0
            };

        } catch (e) {
            logger.error('Failed to load session analytics', e);
            return {
                totalLogs: 0,
                averageScore: 0,
                averageDuration: 0,
                tokenUsage: 0,
                topModel: 'Error',
                successRate: 0
            };
        }
    }

    async getGlobalStats() {
        return await getDbStats();
    }
}

export const sessionAnalyticsService = new SessionAnalyticsService();
