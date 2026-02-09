import admin from 'firebase-admin';
import { DbRepository } from './repository.js';

/**
 * Firestore implementation of DbRepository.
 * Wraps existing Firestore operations from route files.
 */
export class FirestoreRepository extends DbRepository {
    constructor(getDb) {
        super();
        this._getDb = getDb;
    }

    get db() {
        return this._getDb();
    }

    getProviderName() {
        return 'firestore';
    }

    // ─── Sessions ───────────────────────────────────────────────

    async listSessions({ limit = 50, cursor = null, orderBy = 'updatedAt', direction = 'desc' } = {}) {
        let query = this.db.collection('synth_sessions').orderBy(orderBy, direction);
        if (cursor) {
            const cursorDoc = await this.db.collection('synth_sessions').doc(String(cursor)).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }
        const pageLimit = Math.min(limit, 200);
        const snapshot = await query.limit(pageLimit).get();
        const items = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const sessionData = { id: doc.id, ...doc.data() };
                const sessionUid = sessionData.sessionUid || doc.id;
                sessionData.tags = await this.getSessionTags(sessionUid);
                return sessionData;
            })
        );
        const hasMore = snapshot.docs.length === pageLimit;
        const nextCursor = hasMore && snapshot.docs.length > 0
            ? snapshot.docs[snapshot.docs.length - 1].id
            : null;
        return { items, nextCursor, hasMore };
    }

    async getSession(id) {
        const doc = await this.db.collection('synth_sessions').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    async getSessionByUid(sessionUid) {
        const snapshot = await this.db.collection('synth_sessions')
            .where('sessionUid', '==', sessionUid)
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async createSession(data) {
        const now = new Date().toISOString();
        const docRef = await this.db.collection('synth_sessions').add({
            ...data,
            createdAt: now,
            updatedAt: now
        });
        await docRef.update({ sessionUid: docRef.id });
        return { id: docRef.id, sessionUid: docRef.id };
    }

    async updateSession(id, updates) {
        const now = new Date().toISOString();
        await this.db.collection('synth_sessions').doc(id).update({
            ...updates,
            updatedAt: now
        });
    }

    async upsertSession(id, data) {
        const docRef = this.db.collection('synth_sessions').doc(id);
        const doc = await docRef.get();
        const now = new Date().toISOString();
        if (!doc.exists) {
            await docRef.set({
                ...data,
                sessionUid: id,
                createdAt: now,
                updatedAt: now
            });
        } else {
            await docRef.update({
                ...data,
                updatedAt: now
            });
        }
        return { id, exists: doc.exists };
    }

    async deleteSession(id) {
        await this.db.collection('synth_sessions').doc(id).delete();
    }

    async incrementSessionField(id, field, amount = 1) {
        await this.db.collection('synth_sessions').doc(id).update({
            [field]: admin.firestore.FieldValue.increment(amount)
        });
    }

    // ─── Logs ───────────────────────────────────────────────────

    async listLogs({ sessionUid = null, limit = 100, cursor = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        let query;
        if (sessionUid) {
            query = this.db.collection('synth_logs')
                .where('sessionUid', '==', sessionUid)
                .orderBy(orderBy, direction)
                .limit(limit);
        } else {
            query = this.db.collection('synth_logs')
                .orderBy(orderBy, direction)
                .limit(limit);
        }
        if (cursor) {
            query = query.startAfter(cursor);
        }
        const snapshot = await query.get();
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const hasMore = items.length === limit;
        const nextCursor = hasMore && items.length > 0
            ? items[items.length - 1][orderBy === 'createdAt' ? 'createdAt' : orderBy]
            : null;
        return { items, hasMore, nextCursor };
    }

    async getLog(id) {
        const doc = await this.db.collection('synth_logs').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    async createLog(data) {
        const docRef = await this.db.collection('synth_logs').add({
            ...data,
            createdAt: data.createdAt || Date.now()
        });
        return { id: docRef.id };
    }

    async updateLog(id, updates) {
        const docRef = this.db.collection('synth_logs').doc(id);
        await docRef.update(updates);
        const updated = await docRef.get();
        if (!updated.exists) return null;
        return { id: updated.id, ...updated.data() };
    }

    async deleteLogs(ids) {
        const BATCH_SIZE = 100;
        let deleted = 0;
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            const batch = this.db.batch();
            const chunk = ids.slice(i, i + BATCH_SIZE);
            for (const id of chunk) {
                batch.delete(this.db.collection('synth_logs').doc(id));
            }
            await batch.commit();
            deleted += chunk.length;
        }
        return deleted;
    }

    async deleteLogsBySession(sessionUid, batchSize = 500) {
        let deleted = 0;
        let lastDoc = null;
        while (true) {
            let q = this.db.collection('synth_logs')
                .where('sessionUid', '==', sessionUid)
                .orderBy('createdAt', 'desc')
                .limit(batchSize);
            if (lastDoc) {
                q = q.startAfter(lastDoc);
            }
            const snapshot = await q.get();
            if (snapshot.empty) break;
            const batch = this.db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            deleted += snapshot.size;
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }
        return deleted;
    }

    async getLogsByScoreRange(sessionUid, { field = 'score', below = null } = {}) {
        let query = this.db.collection('synth_logs')
            .where('sessionUid', '==', sessionUid);
        if (below !== null) {
            query = query.where(field, '<', below);
        }
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getScoreDistribution(sessionUid, scoreField = 'score') {
        const snapshot = await this.db.collection('synth_logs')
            .where('sessionUid', '==', sessionUid)
            .select(scoreField)
            .get();

        const scores = [];
        let unscoredCount = 0;
        let totalCount = 0;

        snapshot.forEach(doc => {
            totalCount++;
            const data = doc.data();
            const score = data[scoreField];
            if (typeof score === 'number') {
                scores.push(score);
            } else {
                unscoredCount++;
            }
        });

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
        const totalSnapshot = await this.db.collection('synth_logs').count().get();
        const total = totalSnapshot.data().count;
        let session = 0;
        if (sessionUid) {
            const sessionSnapshot = await this.db.collection('synth_logs')
                .where('sessionUid', '==', sessionUid)
                .count()
                .get();
            session = sessionSnapshot.data().count;
        }
        return { total, session };
    }

    async fetchLogsForProcessing(sessionUid, { limit = null, orderBy = 'createdAt', direction = 'desc' } = {}) {
        let query = this.db.collection('synth_logs')
            .where('sessionUid', '==', sessionUid)
            .orderBy(orderBy, direction);
        if (limit) {
            query = query.limit(limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // ─── Jobs ───────────────────────────────────────────────────

    async listJobs({ type = null, status = null, limit = 50 } = {}) {
        let query = this.db.collection('admin_jobs').orderBy('createdAt', 'desc').limit(limit);
        if (type) query = query.where('type', '==', type);
        if (status) query = query.where('status', '==', status);
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getJob(id) {
        const doc = await this.db.collection('admin_jobs').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    async createJob(data) {
        const docId = data.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await this.db.collection('admin_jobs').doc(docId).set({ ...data, id: docId });
        return { ...data, id: docId };
    }

    async updateJob(id, updates) {
        await this.db.collection('admin_jobs').doc(id).set(updates, { merge: true });
    }

    async deleteJob(id) {
        await this.db.collection('admin_jobs').doc(id).delete();
    }

    // ─── Orphans ────────────────────────────────────────────────

    async getAllSessionUids() {
        const snapshot = await this.db.collection('synth_sessions').get();
        const uids = new Set();
        snapshot.docs.forEach(d => {
            uids.add(d.id);
            const data = d.data();
            if (data.sessionUid) uids.add(data.sessionUid);
        });
        return uids;
    }

    async scanForOrphans(sessionUids, { chunkSize = 50, direction = 'desc' } = {}) {
        const orphanUids = new Set();
        const logCounts = new Map();
        let scannedCount = 0;
        let lastDoc = null;

        while (true) {
            let q = this.db.collection('synth_logs').orderBy('createdAt', direction).limit(chunkSize);
            if (lastDoc) q = q.startAfter(lastDoc);
            const snapshot = await q.get();
            if (snapshot.empty) break;

            scannedCount += snapshot.docs.length;
            snapshot.docs.forEach(d => {
                const data = d.data();
                const uid = data.sessionUid || 'unknown';
                if (uid !== 'unknown' && !sessionUids.has(uid)) {
                    orphanUids.add(uid);
                    logCounts.set(uid, (logCounts.get(uid) || 0) + 1);
                }
            });

            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            if (orphanUids.size > 0) break; // stop on first discovery
        }

        return { orphanUids: Array.from(orphanUids), scannedCount, logCounts: Object.fromEntries(logCounts) };
    }

    async batchUpdateLogs(updates, batchSize = 200) {
        // updates is an array of { id, data } objects
        let updated = 0;
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = this.db.batch();
            const chunk = updates.slice(i, i + batchSize);
            for (const { id, data } of chunk) {
                batch.update(this.db.collection('synth_logs').doc(id), data);
            }
            await batch.commit();
            updated += chunk.length;
        }
        return updated;
    }

    // ─── Utility ────────────────────────────────────────────────

    async testConnection() {
        try {
            await this.db.collection('synth_sessions').limit(1).get();
            return { ok: true };
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    }

    async runMigrations() {
    }

    async listTags() {
        const snapshot = await this.db.collection('session_tags').orderBy('createdAt').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async getTagByName(name) {
        const snapshot = await this.db.collection('session_tags')
            .where('name', '==', name.toLowerCase())
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async createTag(data) {
        const docRef = await this.db.collection('session_tags').add(data);
        return { id: docRef.id, ...data };
    }

    async deleteTag(uid) {
        const snapshot = await this.db.collection('session_tags')
            .where('uid', '==', uid)
            .limit(1)
            .get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.delete();
        }
        const mappingsSnapshot = await this.db.collection('session_tag_mappings')
            .where('tagUid', '==', uid)
            .get();
        const batch = this.db.batch();
        mappingsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    async getSessionTags(sessionUid) {
        const mappingsSnapshot = await this.db.collection('session_tag_mappings')
            .where('sessionUid', '==', sessionUid)
            .orderBy('createdAt', 'asc')
            .get();
        if (mappingsSnapshot.empty) return [];

        const mappings = mappingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (mappings.length === 0) return [];

        const tags = [];
        for (const mapping of mappings) {
            const tagSnapshot = await this.db.collection('session_tags')
                .where('uid', '==', mapping.tagUid)
                .limit(1)
                .get();
            if (!tagSnapshot.empty) {
                const doc = tagSnapshot.docs[0];
                tags.push({ id: doc.id, ...doc.data() });
            }
        }
        return tags;
    }

    async addTagsToSession(sessionUid, tagUids) {
        const batch = this.db.batch();
        const now = new Date().toISOString();
        
        for (const tagUid of tagUids) {
            const existingSnapshot = await this.db.collection('session_tag_mappings')
                .where('sessionUid', '==', sessionUid)
                .where('tagUid', '==', tagUid)
                .limit(1)
                .get();
            
            if (existingSnapshot.empty) {
                const docRef = this.db.collection('session_tag_mappings').doc();
                batch.set(docRef, {
                    sessionUid,
                    tagUid,
                    createdAt: now
                });
            }
        }
        
        await batch.commit();
    }

    async removeTagsFromSession(sessionUid, tagUids) {
        const batch = this.db.batch();
        
        for (const tagUid of tagUids) {
            const snapshot = await this.db.collection('session_tag_mappings')
                .where('sessionUid', '==', sessionUid)
                .where('tagUid', '==', tagUid)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                batch.delete(snapshot.docs[0].ref);
            }
        }
        
        await batch.commit();
    }
}
