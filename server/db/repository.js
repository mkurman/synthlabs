/**
 * Database Repository Interface
 *
 * All repository implementations must conform to this interface.
 * Methods are documented with JSDoc for IDE support.
 */

/**
 * @typedef {Object} PaginatedResult
 * @property {Object[]} items
 * @property {string|null} nextCursor
 */

/**
 * @typedef {Object} ScoreDistribution
 * @property {number} min
 * @property {number} max
 * @property {number} avg
 * @property {number} count
 * @property {Object<string, number>} buckets
 * @property {Object<string, number>} thresholdCounts
 */

/**
 * Base repository class. Implementations must override all methods.
 */
export class DbRepository {
    // ─── Sessions ───────────────────────────────────────────────

    /** @returns {Promise<PaginatedResult>} */
    async listSessions({ limit = 50, cursor = null, orderBy = 'updatedAt', direction = 'desc' } = {}) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object|null>} */
    async getSession(id) {
        throw new Error('Not implemented');
    }

    /** Find session by sessionUid field (fallback lookup) @returns {Promise<Object|null>} */
    async getSessionByUid(sessionUid) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object>} created session with id */
    async createSession(data) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<void>} */
    async updateSession(id, updates) {
        throw new Error('Not implemented');
    }

    /** Upsert: update if exists, create if not @returns {Promise<Object>} */
    async upsertSession(id, data) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<void>} */
    async deleteSession(id) {
        throw new Error('Not implemented');
    }

    /** Atomically increment a numeric field on a session @returns {Promise<void>} */
    async incrementSessionField(id, field, amount = 1) {
        throw new Error('Not implemented');
    }

    // ─── Logs ───────────────────────────────────────────────────

    /** @returns {Promise<PaginatedResult>} */
    async listLogs({ sessionUid = null, limit = 100, cursor = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object|null>} */
    async getLog(id) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object>} created log with id */
    async createLog(data) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object>} updated log */
    async updateLog(id, updates) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<number>} count of deleted items */
    async deleteLogs(ids) {
        throw new Error('Not implemented');
    }

    /** Delete all logs for a session, in batches @returns {Promise<number>} count deleted */
    async deleteLogsBySession(sessionUid, batchSize = 500) {
        throw new Error('Not implemented');
    }

    /** Get logs with score in range @returns {Promise<Object[]>} */
    async getLogsByScoreRange(sessionUid, { field = 'score', below = null } = {}) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<ScoreDistribution>} */
    async getScoreDistribution(sessionUid, scoreField = 'score') {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<{ total: number, session: number }>} */
    async getLogStats(sessionUid = null) {
        throw new Error('Not implemented');
    }

    /** Fetch logs for processing (autoscore/rewrite) @returns {Promise<Object[]>} */
    async fetchLogsForProcessing(sessionUid, { limit = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        throw new Error('Not implemented');
    }

    // ─── Jobs ───────────────────────────────────────────────────

    /** @returns {Promise<Object[]>} */
    async listJobs({ type = null, status = null, limit = 50 } = {}) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object|null>} */
    async getJob(id) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<Object>} created job */
    async createJob(data) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<void>} */
    async updateJob(id, updates) {
        throw new Error('Not implemented');
    }

    /** @returns {Promise<void>} */
    async deleteJob(id) {
        throw new Error('Not implemented');
    }

    // ─── Orphans ────────────────────────────────────────────────

    /** Get all session UIDs as a Set @returns {Promise<Set<string>>} */
    async getAllSessionUids() {
        throw new Error('Not implemented');
    }

    /** Scan logs in chunks to find orphans @returns {Promise<{ orphanUids: string[], scannedCount: number }>} */
    async scanForOrphans(sessionUids, { chunkSize = 50, direction = 'desc' } = {}) {
        throw new Error('Not implemented');
    }

    /** Batch update logs to assign them to a session @returns {Promise<number>} count updated */
    async batchUpdateLogs(logIds, updates, batchSize = 200) {
        throw new Error('Not implemented');
    }

    // ─── Utility ────────────────────────────────────────────────

    /** Test if connection is working @returns {Promise<{ ok: boolean, error?: string }>} */
    async testConnection() {
        throw new Error('Not implemented');
    }

    /** Run any needed schema migrations @returns {Promise<void>} */
    async runMigrations() {
        throw new Error('Not implemented');
    }

    /** Get provider name @returns {string} */
    getProviderName() {
        throw new Error('Not implemented');
    }

    /** Clean up resources (connection pools, etc.) @returns {Promise<void>} */
    async close() {
        // default no-op
    }
}
