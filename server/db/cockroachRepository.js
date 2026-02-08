import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DbRepository } from './repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CockroachDB implementation of DbRepository.
 * Uses PostgreSQL-compatible queries via the `pg` package.
 */
export class CockroachRepository extends DbRepository {
    constructor(config) {
        super();
        const resolvedConfig = typeof config === 'string' ? { connectionString: config } : (config || {});
        const connectionString = resolvedConfig.connectionString;
        const caCert = typeof resolvedConfig.caCert === 'string' ? resolvedConfig.caCert.trim() : '';
        const caCertPath = typeof resolvedConfig.caCertPath === 'string' ? resolvedConfig.caCertPath.trim() : '';
        if (!connectionString) {
            throw new Error('[CockroachDB] connectionString is required');
        }
        const poolConfig = { connectionString };
        if (caCert) {
            poolConfig.ssl = { ca: caCert, rejectUnauthorized: true };
        } else if (caCertPath) {
            const resolvedPath = path.isAbsolute(caCertPath) ? caCertPath : path.resolve(process.cwd(), caCertPath);
            try {
                const ca = fs.readFileSync(resolvedPath, 'utf-8');
                poolConfig.ssl = { ca, rejectUnauthorized: true };
            } catch (error) {
                const message = error?.message || error;
                throw new Error(`[CockroachDB] Failed to read CA certificate at ${resolvedPath}: ${message}`);
            }
        }
        this.pool = new pg.Pool(poolConfig);
    }

    getProviderName() {
        return 'cockroachdb';
    }

    async close() {
        await this.pool.end();
    }

    // ─── Helpers ────────────────────────────────────────────────

    _toSession(row) {
        if (!row) return null;
        return {
            id: row.id,
            sessionUid: row.session_uid,
            name: row.name,
            source: row.source,
            appMode: row.app_mode,
            engineMode: row.engine_mode,
            externalModel: row.external_model,
            verificationStatus: row.verification_status,
            logCount: row.log_count,
            itemCount: row.item_count,
            createdAt: row.created_at?.toISOString?.() ?? row.created_at,
            updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
            ...(row.metadata || {})
        };
    }

    _toLog(row) {
        if (!row) return null;
        return {
            id: row.id,
            sessionUid: row.session_uid,
            sessionName: row.session_name,
            query: row.query,
            reasoning: row.reasoning,
            reasoning_content: row.reasoning_content,
            answer: row.answer,
            score: row.score != null ? parseFloat(row.score) : undefined,
            verificationStatus: row.verification_status,
            savedToDb: row.saved_to_db,
            messages: row.messages,
            createdAt: row.created_at instanceof Date ? row.created_at.getTime() : row.created_at,
            updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : row.updated_at,
            ...(row.metadata || {})
        };
    }

    _toJob(row) {
        if (!row) return null;
        return {
            id: row.id,
            type: row.type,
            status: row.status,
            progress: row.progress || {},
            config: row.config || {},
            params: row.params || {},
            result: row.result,
            error: row.error,
            createdAt: row.created_at instanceof Date ? row.created_at.getTime() : row.created_at,
            updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : row.updated_at
        };
    }

    // ─── Sessions ───────────────────────────────────────────────

    async listSessions({ limit = 50, cursor = null, orderBy = 'updatedAt', direction = 'desc' } = {}) {
        const colMap = { updatedAt: 'updated_at', createdAt: 'created_at', name: 'name' };
        const col = colMap[orderBy] || 'updated_at';
        const dir = direction === 'asc' ? 'ASC' : 'DESC';
        const pageLimit = Math.min(limit, 200);

        let query, params;
        if (cursor) {
            // Cursor-based: fetch the cursor row's sort value, then paginate
            const cursorRow = await this.pool.query('SELECT ' + col + ' FROM synth_sessions WHERE id = $1', [cursor]);
            if (cursorRow.rows.length > 0) {
                const op = dir === 'DESC' ? '<' : '>';
                query = `SELECT * FROM synth_sessions WHERE ${col} ${op} $1 ORDER BY ${col} ${dir} LIMIT $2`;
                params = [cursorRow.rows[0][col], pageLimit];
            } else {
                query = `SELECT * FROM synth_sessions ORDER BY ${col} ${dir} LIMIT $1`;
                params = [pageLimit];
            }
        } else {
            query = `SELECT * FROM synth_sessions ORDER BY ${col} ${dir} LIMIT $1`;
            params = [pageLimit];
        }

        const result = await this.pool.query(query, params);
        const items = result.rows.map(r => this._toSession(r));
        const hasMore = items.length === pageLimit;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
        return { items, nextCursor, hasMore };
    }

    async getSession(id) {
        const result = await this.pool.query('SELECT * FROM synth_sessions WHERE id = $1', [id]);
        return this._toSession(result.rows[0]);
    }

    async getSessionByUid(sessionUid) {
        const result = await this.pool.query('SELECT * FROM synth_sessions WHERE session_uid = $1 LIMIT 1', [sessionUid]);
        return this._toSession(result.rows[0]);
    }

    async createSession(data) {
        const id = data.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date();
        const metadata = {};
        const knownFields = new Set(['id', 'sessionUid', 'name', 'source', 'appMode', 'engineMode', 'externalModel', 'verificationStatus', 'logCount', 'itemCount', 'createdAt', 'updatedAt', 'config']);
        for (const [k, v] of Object.entries(data)) {
            if (!knownFields.has(k)) metadata[k] = v;
        }

        await this.pool.query(
            `INSERT INTO synth_sessions (id, session_uid, name, source, app_mode, engine_mode, external_model, verification_status, log_count, item_count, created_at, updated_at, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
                id,
                data.sessionUid || id,
                data.name || null,
                data.source || null,
                data.appMode || data.config?.appMode || null,
                data.engineMode || data.config?.engineMode || null,
                data.externalModel || data.config?.externalModel || null,
                data.verificationStatus || null,
                data.logCount || 0,
                data.itemCount || 0,
                now,
                now,
                JSON.stringify(metadata)
            ]
        );
        return { id, sessionUid: id };
    }

    async updateSession(id, updates) {
        const setClauses = [];
        const values = [];
        let idx = 1;

        const colMap = {
            name: 'name', source: 'source', appMode: 'app_mode', engineMode: 'engine_mode',
            externalModel: 'external_model', verificationStatus: 'verification_status',
            logCount: 'log_count', itemCount: 'item_count', sessionUid: 'session_uid'
        };

        const metadata = {};
        const knownFields = new Set([...Object.keys(colMap), 'id', 'createdAt', 'updatedAt', 'config']);

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id' || key === 'createdAt') continue;
            if (colMap[key]) {
                setClauses.push(`${colMap[key]} = $${idx++}`);
                values.push(value);
            } else if (!knownFields.has(key)) {
                metadata[key] = value;
            }
        }

        if (Object.keys(metadata).length > 0) {
            setClauses.push(`metadata = metadata || $${idx++}::jsonb`);
            values.push(JSON.stringify(metadata));
        }

        setClauses.push(`updated_at = $${idx++}`);
        values.push(new Date());
        values.push(id);

        if (setClauses.length > 0) {
            await this.pool.query(
                `UPDATE synth_sessions SET ${setClauses.join(', ')} WHERE id = $${idx}`,
                values
            );
        }
    }

    async upsertSession(id, data) {
        const existing = await this.getSession(id);
        if (existing) {
            await this.updateSession(id, data);
            return { id, exists: true };
        }
        await this.createSession({ ...data, id });
        return { id, exists: false };
    }

    async deleteSession(id) {
        await this.pool.query('DELETE FROM synth_sessions WHERE id = $1', [id]);
    }

    async incrementSessionField(id, field, amount = 1) {
        const colMap = { logCount: 'log_count', itemCount: 'item_count' };
        const col = colMap[field] || field;
        await this.pool.query(
            `UPDATE synth_sessions SET ${col} = ${col} + $1, updated_at = $2 WHERE id = $3`,
            [amount, new Date(), id]
        );
    }

    // ─── Logs ───────────────────────────────────────────────────

    async listLogs({ sessionUid = null, limit = 100, cursor = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        const colMap = { createdAt: 'created_at', updatedAt: 'updated_at', score: 'score' };
        const col = colMap[orderBy] || 'created_at';
        const dir = direction === 'asc' ? 'ASC' : 'DESC';
        const conditions = [];
        const params = [];
        let idx = 1;

        if (sessionUid) {
            conditions.push(`session_uid = $${idx++}`);
            params.push(sessionUid);
        }
        if (cursor) {
            const op = dir === 'DESC' ? '<' : '>';
            conditions.push(`${col} ${op} $${idx++}`);
            // Convert cursor (Unix timestamp in ms) back to Date for PostgreSQL
            const cursorDate = typeof cursor === 'number' || (typeof cursor === 'string' && !isNaN(Number(cursor)))
                ? new Date(Number(cursor))
                : new Date(cursor);
            params.push(cursorDate);
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        params.push(limit);

        const result = await this.pool.query(
            `SELECT * FROM synth_logs ${where} ORDER BY ${col} ${dir} LIMIT $${idx}`,
            params
        );

        const items = result.rows.map(r => this._toLog(r));
        const hasMore = items.length === limit;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;
        return { items, hasMore, nextCursor };
    }

    async getLog(id) {
        const result = await this.pool.query('SELECT * FROM synth_logs WHERE id = $1', [id]);
        return this._toLog(result.rows[0]);
    }

    async createLog(data) {
        const id = data.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date();
        const metadata = {};
        const knownFields = new Set(['id', 'sessionUid', 'sessionName', 'query', 'reasoning', 'reasoning_content', 'answer', 'score', 'verificationStatus', 'savedToDb', 'messages', 'createdAt', 'updatedAt']);
        for (const [k, v] of Object.entries(data)) {
            if (!knownFields.has(k)) metadata[k] = v;
        }

        await this.pool.query(
            `INSERT INTO synth_logs (id, session_uid, session_name, query, reasoning, reasoning_content, answer, score, verification_status, saved_to_db, messages, created_at, updated_at, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
                id,
                data.sessionUid || null,
                data.sessionName || null,
                data.query || null,
                data.reasoning || null,
                data.reasoning_content || null,
                data.answer || null,
                data.score != null ? data.score : null,
                data.verificationStatus || null,
                data.savedToDb !== false,
                data.messages ? JSON.stringify(data.messages) : null,
                data.createdAt ? new Date(data.createdAt) : now,
                now,
                JSON.stringify(metadata)
            ]
        );
        return { id };
    }

    async updateLog(id, updates) {
        const setClauses = [];
        const values = [];
        let idx = 1;

        const colMap = {
            sessionUid: 'session_uid', sessionName: 'session_name',
            query: 'query', reasoning: 'reasoning', reasoning_content: 'reasoning_content',
            answer: 'answer', score: 'score', verificationStatus: 'verification_status',
            savedToDb: 'saved_to_db'
        };

        const metadata = {};
        const knownFields = new Set([...Object.keys(colMap), 'id', 'createdAt', 'updatedAt', 'messages']);

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'id' || key === 'createdAt') continue;
            if (key === 'messages') {
                setClauses.push(`messages = $${idx++}`);
                values.push(JSON.stringify(value));
            } else if (colMap[key]) {
                setClauses.push(`${colMap[key]} = $${idx++}`);
                values.push(value);
            } else if (!knownFields.has(key)) {
                metadata[key] = value;
            }
        }

        if (Object.keys(metadata).length > 0) {
            setClauses.push(`metadata = metadata || $${idx++}::jsonb`);
            values.push(JSON.stringify(metadata));
        }

        setClauses.push(`updated_at = $${idx++}`);
        values.push(new Date());
        values.push(id);

        if (setClauses.length > 0) {
            await this.pool.query(
                `UPDATE synth_logs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
                values
            );
        }

        return this.getLog(id);
    }

    async deleteLogs(ids) {
        if (ids.length === 0) return 0;
        const result = await this.pool.query(
            `DELETE FROM synth_logs WHERE id = ANY($1::text[])`,
            [ids]
        );
        return result.rowCount;
    }

    async deleteLogsBySession(sessionUid) {
        const result = await this.pool.query(
            'DELETE FROM synth_logs WHERE session_uid = $1',
            [sessionUid]
        );
        return result.rowCount;
    }

    async getLogsByScoreRange(sessionUid, { field = 'score', below = null } = {}) {
        const conditions = ['session_uid = $1'];
        const params = [sessionUid];
        let idx = 2;
        if (below !== null) {
            conditions.push(`${field} < $${idx++}`);
            params.push(below);
        }
        const result = await this.pool.query(
            `SELECT * FROM synth_logs WHERE ${conditions.join(' AND ')}`,
            params
        );
        return result.rows.map(r => this._toLog(r));
    }

    async getScoreDistribution(sessionUid, scoreField = 'score') {
        // Fetch all scores for client-side computation (matches Firestore behavior)
        const result = await this.pool.query(
            `SELECT ${scoreField} FROM synth_logs WHERE session_uid = $1`,
            [sessionUid]
        );

        const scores = [];
        let unscoredCount = 0;
        let totalCount = result.rows.length;

        for (const row of result.rows) {
            const score = row[scoreField];
            if (score != null && !isNaN(score)) {
                scores.push(parseFloat(score));
            } else {
                unscoredCount++;
            }
        }

        if (scores.length === 0) {
            return { totalCount, scoredCount: 0, unscoredCount, scores: [], scoreField };
        }

        const distribution = { '0-1': 0, '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0, '5-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
        scores.forEach(score => {
            if (score < 1) distribution['0-1']++;
            else if (score < 2) distribution['1-2']++;
            else if (score < 3) distribution['2-3']++;
            else if (score < 4) distribution['3-4']++;
            else if (score < 5) distribution['4-5']++;
            else if (score < 6) distribution['5-6']++;
            else if (score < 7) distribution['6-7']++;
            else if (score < 8) distribution['7-8']++;
            else if (score < 9) distribution['8-9']++;
            else distribution['9-10']++;
        });

        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const thresholdPreview = {};
        [3, 4, 5, 6, 7].forEach(t => {
            thresholdPreview[`below_${t}`] = scores.filter(s => s < t).length;
        });

        return {
            totalCount,
            scoredCount: scores.length,
            unscoredCount,
            scoreField,
            statistics: {
                min: Math.min(...scores).toFixed(2),
                max: Math.max(...scores).toFixed(2),
                average: avg.toFixed(2)
            },
            distribution,
            thresholdPreview
        };
    }

    async getLogStats(sessionUid = null) {
        const totalResult = await this.pool.query('SELECT COUNT(*)::int as count FROM synth_logs');
        const total = totalResult.rows[0].count;
        let session = 0;
        if (sessionUid) {
            const sessionResult = await this.pool.query(
                'SELECT COUNT(*)::int as count FROM synth_logs WHERE session_uid = $1',
                [sessionUid]
            );
            session = sessionResult.rows[0].count;
        }
        return { total, session };
    }

    async fetchLogsForProcessing(sessionUid, { limit = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        const colMap = { createdAt: 'created_at', updatedAt: 'updated_at', score: 'score' };
        const col = colMap[orderBy] || 'created_at';
        const dir = direction === 'asc' ? 'ASC' : 'DESC';

        let query = `SELECT * FROM synth_logs WHERE session_uid = $1 ORDER BY ${col} ${dir}`;
        const params = [sessionUid];
        if (limit) {
            query += ` LIMIT $2`;
            params.push(limit);
        }

        const result = await this.pool.query(query, params);
        return result.rows.map(r => this._toLog(r));
    }

    // ─── Jobs ───────────────────────────────────────────────────

    async listJobs({ type = null, status = null, limit = 50 } = {}) {
        const conditions = [];
        const params = [];
        let idx = 1;
        if (type) {
            conditions.push(`type = $${idx++}`);
            params.push(type);
        }
        if (status) {
            conditions.push(`status = $${idx++}`);
            params.push(status);
        }
        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        params.push(limit);
        const result = await this.pool.query(
            `SELECT * FROM admin_jobs ${where} ORDER BY created_at DESC LIMIT $${idx}`,
            params
        );
        return result.rows.map(r => this._toJob(r));
    }

    async getJob(id) {
        const result = await this.pool.query('SELECT * FROM admin_jobs WHERE id = $1', [id]);
        return this._toJob(result.rows[0]);
    }

    async createJob(data) {
        const id = data.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date();
        await this.pool.query(
            `INSERT INTO admin_jobs (id, type, status, progress, config, params, result, error, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                id,
                data.type || 'unknown',
                data.status || 'pending',
                JSON.stringify(data.progress || {}),
                JSON.stringify(data.config || {}),
                JSON.stringify(data.params || {}),
                data.result ? JSON.stringify(data.result) : null,
                data.error || null,
                now,
                now
            ]
        );
        return { ...data, id, createdAt: now.getTime(), updatedAt: now.getTime() };
    }

    async updateJob(id, updates) {
        const setClauses = [];
        const values = [];
        let idx = 1;

        if (updates.status !== undefined) {
            setClauses.push(`status = $${idx++}`);
            values.push(updates.status);
        }
        if (updates.progress !== undefined) {
            setClauses.push(`progress = $${idx++}`);
            values.push(JSON.stringify(updates.progress));
        }
        if (updates.params !== undefined) {
            setClauses.push(`params = $${idx++}`);
            values.push(JSON.stringify(updates.params));
        }
        if (updates.result !== undefined) {
            setClauses.push(`result = $${idx++}`);
            values.push(JSON.stringify(updates.result));
        }
        if (updates.error !== undefined) {
            setClauses.push(`error = $${idx++}`);
            values.push(updates.error);
        }

        setClauses.push(`updated_at = $${idx++}`);
        values.push(new Date());
        values.push(id);

        if (setClauses.length > 0) {
            await this.pool.query(
                `UPDATE admin_jobs SET ${setClauses.join(', ')} WHERE id = $${idx}`,
                values
            );
        }
    }

    async deleteJob(id) {
        await this.pool.query('DELETE FROM admin_jobs WHERE id = $1', [id]);
    }

    // ─── Orphans ────────────────────────────────────────────────

    async getAllSessionUids() {
        const result = await this.pool.query('SELECT id, session_uid FROM synth_sessions');
        const uids = new Set();
        for (const row of result.rows) {
            uids.add(row.id);
            if (row.session_uid) uids.add(row.session_uid);
        }
        return uids;
    }

    async scanForOrphans(sessionUids, { chunkSize = 50, direction = 'desc' } = {}) {
        const dir = direction === 'asc' ? 'ASC' : 'DESC';
        const orphanUids = new Set();
        const logCounts = new Map();
        let scannedCount = 0;
        let offset = 0;

        while (true) {
            const result = await this.pool.query(
                `SELECT session_uid FROM synth_logs ORDER BY created_at ${dir} LIMIT $1 OFFSET $2`,
                [chunkSize, offset]
            );
            if (result.rows.length === 0) break;

            scannedCount += result.rows.length;
            for (const row of result.rows) {
                const uid = row.session_uid || 'unknown';
                if (uid !== 'unknown' && !sessionUids.has(uid)) {
                    orphanUids.add(uid);
                    logCounts.set(uid, (logCounts.get(uid) || 0) + 1);
                }
            }

            offset += result.rows.length;
            if (orphanUids.size > 0) break;
        }

        return { orphanUids: Array.from(orphanUids), scannedCount, logCounts: Object.fromEntries(logCounts) };
    }

    async batchUpdateLogs(updates, batchSize = 200) {
        let updated = 0;
        for (const { id, data } of updates) {
            await this.updateLog(id, data);
            updated++;
        }
        return updated;
    }

    // ─── Utility ────────────────────────────────────────────────

    async testConnection() {
        try {
            await this.pool.query('SELECT 1');
            return { ok: true };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    }

    async runMigrations() {
        const sqlPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        await this.pool.query(sql);
        console.log('[CockroachDB] Migrations applied successfully');
    }
}
