import type { AutoscoreConfig, AutoscoreToolParams, AutoscoreToolResult, SessionListToolParams, VerifierItem } from '../types';
import { ToolFieldName, ProviderType, PromptCategory, PromptRole } from '../interfaces/enums';
import { PROVIDERS } from '../constants';
import * as FirebaseService from './firebaseService';
import * as backendClient from './backendClient';
import { encryptKey } from '../utils/keyEncryption';
import { addJob as trackJobInStorage } from './jobStorageService';
import { SettingsService } from './settingsService';
import { PromptService } from './promptService';
import type { SessionData } from '../interfaces';
import type { RewriterConfig } from './verifierRewriterService';

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

export type ToolFunction = (args: any) => Promise<any>;

export interface RegisteredTool {
    definition: ToolDefinition;
    execute: ToolFunction;
    approval?: ToolApprovalInfo;
}

export interface ToolContext {
    data: VerifierItem[];
    setData: any;
    currentSessionUid?: string;
    autoSaveEnabled?: boolean;
    handleDbUpdate?: (item: VerifierItem) => Promise<void>;
    fetchMoreFromDb?: (start: number, end: number) => Promise<void>;
    refreshRowsFromDb?: (startIndex: number, endIndex: number) => Promise<VerifierItem[]>;
    sessions?: SessionData[];
    refreshSessions?: () => Promise<SessionData[]>;
    renameSession?: (sessionId: string, newName: string) => Promise<void>;
    autoscoreItems?: (params: AutoscoreToolParams) => Promise<AutoscoreToolResult>;
    loadSessionById?: (sessionId: string) => Promise<void>;
    loadSessionRows?: (sessionId: string, offset: number, limit: number) => Promise<VerifierItem[]>;
    getApiKey?: (provider: string) => string;
    getExternalProvider?: () => string;
    getCustomBaseUrl?: () => string;
    getModel?: () => string;
    getAutoscoreConfig?: () => AutoscoreConfig | null;
    getRewriterConfig?: () => RewriterConfig | null;
}

export interface ToolRegistrationOptions {
    requiresApproval?: boolean;
    approvalSettingName?: string;
}

export interface ToolApprovalInfo {
    requiresApproval: boolean;
    approvalSettingName?: string;
}

export class ToolExecutor {
    private tools: Map<string, RegisteredTool> = new Map();
    private contextProvider: () => ToolContext;

    constructor(contextProvider: () => ToolContext) {
        this.contextProvider = contextProvider;
        this.registerDefaultTools();
    }

    private registerDefaultTools() {
        // 1. getTotalItemsCount
        this.registerTool({
            name: 'getTotalItemsCount',
            description: 'Get the total number of items in the current verification dataset. Requires sessionId to confirm which session you are querying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to query. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    }
                },
                required: ['sessionId']
            }
        }, async ({ sessionId }: { sessionId: string }) => {
            const { data, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            return { sessionId, count: data.length };
        });

        // 1b. getCurrentSessionId
        this.registerTool({
            name: 'getCurrentSessionId',
            description: 'Get the session ID (sessionUid) of the currently loaded/viewing session in the verifier panel. Use this to get the session ID for tools like runAutoScore, fetchSessionRows, etc.',
            parameters: {
                type: 'object',
                properties: {},
            }
        }, async () => {
            const { currentSessionUid } = this.contextProvider();
            if (!currentSessionUid) {
                return { sessionId: null, message: 'No session is currently loaded. Load a session first using loadSession.' };
            }
            return { sessionId: currentSessionUid };
        });

        // 2. getItems
        this.registerTool({
            name: 'getItems',
            description: 'Get a list of items (logs) from the dataset. Returns partial fields by default to save tokens. Requires sessionId to confirm which session you are querying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to query. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    start: { type: 'number', description: 'Start index (0-based)' },
                    end: { type: 'number', description: 'End index (exclusive)' },
                    field: { type: 'string', enum: [ToolFieldName.Query, ToolFieldName.Reasoning, ToolFieldName.Answer, ToolFieldName.All, ToolFieldName.Messages], description: 'Specific field to retrieve. Defaults to "all" if not specified.' }
                },
                required: ['sessionId', 'start']
            }
        }, async ({ sessionId, start, end, field }: { sessionId: string; start: number; end?: number; field?: string }) => {
            const { data, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            const safeStart = Math.max(0, start || 0);
            const safeEnd = end ? Math.min(data.length, end) : Math.min(data.length, safeStart + 5); // Default 5 items

            const items = data.slice(safeStart, safeEnd);

            if (field && field !== ToolFieldName.All) {
                return items.map((item, idx) => ({
                    index: safeStart + idx,
                    [field]: item[field as keyof VerifierItem]
                }));
            }

            // Return a summary by default to avoid huge token usage
            return items.map((item, idx) => {
                if (item.messages && item.messages?.length > 0) {
                    return {
                        index: safeStart + idx,
                        id: item.id,
                        messages: item.messages
                    }
                }

                return {
                    index: safeStart + idx,
                    id: item.id,
                    query: item.query ? item.query : '',
                    reasoning_length: item.reasoning?.length || 0,
                    answer: item.answer ? item.answer : ''
                }
            });
        });

        // 3. getItem
        this.registerTool({
            name: 'getItem',
            description: 'Get a single specific item (log) by index with full details. Requires sessionId to confirm which session you are querying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to query. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    index: { type: 'number', description: 'Index of the item' }
                },
                required: ['sessionId', 'index']
            }
        }, async ({ sessionId, index }: { sessionId: string; index: number }) => {
            const { data, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            if (index < 0 || index >= data.length) {
                return { error: `Index ${index} out of bounds. Total items: ${data.length}` };
            }
            const item = data[index] as any;

            if (item.messages && item.messages?.length > 0) {
                return {
                    index,
                    id: item.id,
                    messages: item.messages
                }
            }

            return {
                query: item.query,
                reasoning: item.reasoning,
                answer: item.answer,
                ...(item.messages && { messages: item.messages }),
                ...(item.full_seed && { full_seed: item.full_seed }),
            };
        });

        // 3b. getItemById
        this.registerTool({
            name: 'getItemById',
            description: 'Get a single specific item (log) by its unique ID with full details. This is useful when you know the ID but not the index. Requires sessionId to confirm which session you are querying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to query. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    id: { type: 'string', description: 'Unique ID of the item to fetch' }
                },
                required: ['sessionId', 'id']
            }
        }, async ({ sessionId, id }: { sessionId: string; id: string }) => {
            const { data, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            const index = data.findIndex((item: VerifierItem) => item.id === id);

            if (index === -1) {
                return { error: `Item with ID "${id}" not found in current session.` };
            }

            const item = data[index] as any;

            if (item.messages && item.messages?.length > 0) {
                return {
                    index,
                    id: item.id,
                    messages: item.messages
                };
            }

            return {
                index,
                id: item.id,
                query: item.query,
                reasoning: item.reasoning,
                answer: item.answer,
                ...(item.messages && { messages: item.messages }),
                ...(item.full_seed && { full_seed: item.full_seed }),
            };
        });

        // 4. updateItem
        this.registerTool({
            name: 'updateItem',
            description: 'Update a specific field of an item (log) in the local state. Updates are immediately reflected in UI. Requires sessionId to confirm which session you are modifying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to modify. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    index: { type: 'number' },
                    field: { type: 'string', enum: [ToolFieldName.Query, ToolFieldName.Reasoning, ToolFieldName.Answer] },
                    value: { type: 'string', description: 'The new value for the field' }
                },
                required: ['sessionId', 'index', 'field', 'value']
            }
        }, async ({ sessionId, index, field, value }: { sessionId: string; index: number; field: string; value: string }) => {
            const { setData, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            // We use functional update to ensure we're working with the latest state
            // even if multiple updates happen in the same render cycle
            setData((prevData: VerifierItem[]) => {
                const safeIndex = index;
                // Since this runs inside the state setter, we can't easily return { error } to the tool caller
                // if the index is invalid, but we can prevent the update.
                if (safeIndex < 0 || safeIndex >= prevData.length) {
                    console.error(`[ToolExecutor] Index ${safeIndex} out of bounds (total: ${prevData.length}).`);
                    return prevData;
                }

                const item = prevData[safeIndex];
                const updatedItem = { ...item, [field]: value, hasUnsavedChanges: true };

                // Create shallow copy of array
                const newData = [...prevData];
                newData[safeIndex] = updatedItem;
                return newData;
            });

            // Trigger Autosave if enabled (bridged from React component via context)
            const { autoSaveEnabled, handleDbUpdate, data } = this.contextProvider();

            // Note: 'data' from contextProvider might be stale in closure unless it's a ref.
            // But we actually need the *latest* data to save to DB. 
            // Since we just called setData, the state update is pending.
            // We can reconstruct the item change here to pass to handleDbUpdate.

            if (autoSaveEnabled && handleDbUpdate) {
                const safeIndex = index;
                // We use 'data' from context. Ideally this should be a ref.current from the provider to be fresh.
                // In VerifierPanel we used dataRef.current, so 'data' here IS fresh!
                if (data && data[safeIndex]) {
                    const item = data[safeIndex];
                    const updatedItem = { ...item, [field]: value, hasUnsavedChanges: true };
                    handleDbUpdate(updatedItem);
                }
            }

            // We assume success if we dispatched the update.
            return { success: true, message: `Updated item ${index} ${field}.` };
        });

        // 5. fetchRows (New Tool)
        this.registerTool({
            name: 'fetchRows',
            description: 'Fetch rows from the database. Supports two modes: (1) append mode (default) — fetches the next batch of rows after the current list, (2) fresh mode — re-fetches rows at the given indices from the database and replaces them in the UI. Use fresh mode after auto-scoring or rewriting to see updated data. Requires sessionId to confirm which session you are fetching from.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to fetch from. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    start: { type: 'number', description: 'Start index (0-based)' },
                    end: { type: 'number', description: 'End index (exclusive)' },
                    fresh: { type: 'boolean', description: 'When true, re-fetches rows at start..end from the database and replaces them in the UI. Useful to see updated scores/rewrites.' }
                },
                required: ['sessionId', 'start']
            }
        }, async ({ sessionId, start, end, fresh }: { sessionId: string; start: number; end?: number; fresh?: boolean }) => {
            const ctx = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!ctx.currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== ctx.currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${ctx.currentSessionUid}".` };
            }

            if (fresh) {
                if (!ctx.refreshRowsFromDb) {
                    return { error: 'Fresh row refresh not available in this context.' };
                }
                const effectiveEnd = end ?? (start + 1);
                const refreshed = await ctx.refreshRowsFromDb(start, effectiveEnd);
                return { success: true, message: `Refreshed ${refreshed.length} rows (indices ${start}–${effectiveEnd - 1}) from the database.`, count: refreshed.length };
            }
            const { fetchMoreFromDb } = ctx as any;
            if (fetchMoreFromDb) {
                await fetchMoreFromDb(start, end);
                return { success: true, message: "Fetched more rows." };
            }
            return { error: 'Fetch more not available in this context.' };
        });

        // 6. listSessions
        this.registerTool({
            name: 'listSessions',
            description: 'List available sessions with optional row-count filtering. Useful for finding sessions by size.',
            parameters: {
                type: 'object',
                properties: {
                    minRows: { type: 'number', description: 'Minimum rows/logs in session' },
                    maxRows: { type: 'number', description: 'Maximum rows/logs in session' },
                    limit: { type: 'number', description: 'Max number of sessions to return' }
                }
            }
        }, async ({ minRows, maxRows, limit }: SessionListToolParams = {}) => {
            const { sessions } = this.contextProvider();
            if (!sessions) {
                return { error: 'Sessions list not available in this context.' };
            }

            const filtered = sessions.filter(session => {
                const rowCount = session.itemCount ?? session.logCount ?? 0;
                if (typeof minRows === 'number' && rowCount < minRows) return false;
                if (typeof maxRows === 'number' && rowCount > maxRows) return false;
                return true;
            });

            const limited = typeof limit === 'number' ? filtered.slice(0, Math.max(0, limit)) : filtered;

            return limited.map(session => ({
                id: session.id,
                sessionUid: session.sessionUid,
                name: session.name,
                rows: session.itemCount ?? session.logCount ?? 0,
                updatedAt: session.updatedAt,
                createdAt: session.createdAt,
                status: session.status
            }));
        });

        // 7. getLatestSession
        this.registerTool({
            name: 'getLatestSession',
            description: 'Get the most recently updated session.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }, async () => {
            const { sessions } = this.contextProvider();
            if (!sessions || sessions.length === 0) {
                return { error: 'Sessions list not available in this context.' };
            }
            const sorted = [...sessions].sort((a, b) => {
                const aTime = a.updatedAt || new Date(a.createdAt || 0).getTime();
                const bTime = b.updatedAt || new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            });
            const latest = sorted[0];
            return {
                id: latest.id,
                sessionUid: latest.sessionUid,
                name: latest.name,
                rows: latest.itemCount ?? latest.logCount ?? 0,
                updatedAt: latest.updatedAt,
                createdAt: latest.createdAt,
                status: latest.status
            };
        });

        // 8. getSessionWithMostRows
        this.registerTool({
            name: 'getSessionWithMostRows',
            description: 'Get the session with the highest number of rows/logs.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }, async () => {
            const { sessions } = this.contextProvider();
            if (!sessions || sessions.length === 0) {
                return { error: 'Sessions list not available in this context.' };
            }
            const top = sessions.reduce((best, current) => {
                const bestRows = best.itemCount ?? best.logCount ?? 0;
                const currentRows = current.itemCount ?? current.logCount ?? 0;
                return currentRows > bestRows ? current : best;
            }, sessions[0]);
            return {
                id: top.id,
                sessionUid: top.sessionUid,
                name: top.name,
                rows: top.itemCount ?? top.logCount ?? 0,
                updatedAt: top.updatedAt,
                createdAt: top.createdAt,
                status: top.status
            };
        });

        // 9. getSessionWithFewestRows
        this.registerTool({
            name: 'getSessionWithFewestRows',
            description: 'Get the session with the lowest number of rows/logs.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }, async () => {
            const { sessions } = this.contextProvider();
            if (!sessions || sessions.length === 0) {
                return { error: 'Sessions list not available in this context.' };
            }
            const lowest = sessions.reduce((best, current) => {
                const bestRows = best.itemCount ?? best.logCount ?? 0;
                const currentRows = current.itemCount ?? current.logCount ?? 0;
                return currentRows < bestRows ? current : best;
            }, sessions[0]);
            return {
                id: lowest.id,
                sessionUid: lowest.sessionUid,
                name: lowest.name,
                rows: lowest.itemCount ?? lowest.logCount ?? 0,
                updatedAt: lowest.updatedAt,
                createdAt: lowest.createdAt,
                status: lowest.status
            };
        });

        // 10. fetchSessionRows
        this.registerTool({
            name: 'fetchSessionRows',
            description: 'Fetch rows from a specific session by ID with offset and limit.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID (sessionUid) to fetch logs from' },
                    offset: { type: 'number', description: 'Offset from newest log (0-based)' },
                    limit: { type: 'number', description: 'Number of rows to fetch' },
                    field: { type: 'string', enum: [ToolFieldName.Query, ToolFieldName.Reasoning, ToolFieldName.Answer, ToolFieldName.All, ToolFieldName.Messages], description: 'Specific field to retrieve. Defaults to "all" if not specified.' }
                },
                required: ['sessionId', 'limit']
            }
        }, async ({ sessionId, offset, limit, field }: { sessionId: string; offset?: number; limit: number; field?: string }) => {
            const safeOffset = Math.max(0, offset || 0);
            const safeLimit = Math.max(1, limit || 1);
            const fetchCount = safeOffset + safeLimit;

            const { loadSessionRows } = this.contextProvider();
            const logs = loadSessionRows
                ? await loadSessionRows(sessionId, safeOffset, safeLimit)
                : await FirebaseService.fetchAllLogs(fetchCount, sessionId).then(items => items.slice(safeOffset, safeOffset + safeLimit));

            const sliced = logs;

            if (field && field !== ToolFieldName.All) {
                return sliced.map((item, idx) => ({
                    index: safeOffset + idx,
                    id: item.id,
                    [field]: item[field as keyof VerifierItem]
                }));
            }

            return sliced.map((item, idx) => ({
                index: safeOffset + idx,
                id: item.id,
                query: item.query ? item.query : '',
                reasoning_length: item.reasoning?.length || 0,
                answer: item.answer ? item.answer : '',
                // Include score fields
                ...((item as any).score !== undefined && { score: (item as any).score }),
                ...(item.messages && { messages: item.messages })
            }));
        });

        // 11. loadSessionById
        this.registerTool({
            name: 'loadSessionById',
            description: 'Load a session by ID into the UI (same as selecting it in the sidebar).',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID (sessionUid) to load' }
                },
                required: ['sessionId']
            }
        }, async ({ sessionId }: { sessionId: string }) => {
            const { loadSessionById } = this.contextProvider();
            if (!loadSessionById) {
                return { error: 'Load session not available in this context.' };
            }
            await loadSessionById(sessionId);
            return { success: true, message: `Loaded session ${sessionId}.` };
        });

        // 12. refreshSessionsList
        this.registerTool({
            name: 'refreshSessionsList',
            description: 'Refresh the available sessions list from storage.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }, async () => {
            const { refreshSessions } = this.contextProvider();
            if (!refreshSessions) {
                return { error: 'Refresh sessions not available in this context.' };
            }
            const sessions = await refreshSessions();
            return { success: true, count: sessions.length };
        });

        // 13. renameSession (requires approval)
        this.registerTool({
            name: 'renameSession',
            description: 'Rename a session by ID. Requires approval.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID to rename' },
                    newName: { type: 'string', description: 'New session name' }
                },
                required: ['sessionId', 'newName']
            }
        }, async ({ sessionId, newName }) => {
            const { renameSession } = this.contextProvider();
            if (!renameSession) {
                return { error: 'Rename session not available in this context.' };
            }
            await renameSession(sessionId, newName);
            return { success: true, message: `Renamed session ${sessionId}.` };
        }, {
            requiresApproval: true,
            approvalSettingName: 'Rename session'
        });

        // 14. autoscoreItems
        this.registerTool({
            name: 'autoscoreItems',
            description: 'Set scores for a set of items by indices. Scores are applied to items locally. Requires sessionId to confirm which session you are modifying.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to modify. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    indices: { type: 'array', items: { type: 'number' }, description: 'Item indices to score' },
                    scores: { type: 'array', items: { type: 'number' }, description: 'Scores corresponding to indices' }
                },
                required: ['sessionId', 'indices', 'scores']
            }
        }, async (params: AutoscoreToolParams & { sessionId: string }) => {
            const { autoscoreItems, currentSessionUid } = this.contextProvider();

            if (!params.sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (params.sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${params.sessionId}" but currently loaded is "${currentSessionUid}".` };
            }

            if (!autoscoreItems) {
                return { error: 'Autoscore not available in this context.' };
            }
            return autoscoreItems(params);
        });

        // 15. updateItemsInDb
        this.registerTool({
            name: 'updateItemsInDb',
            description: 'Persist changes for a range of items to the database (Firebase). Use this after making local updates. Requires sessionId to confirm which session you are saving.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to save. Must match the currently loaded session. Use getCurrentSessionId to get this value.'
                    },
                    start: { type: 'number', description: 'Start index' },
                    end: { type: 'number', description: 'End index' }
                },
                required: ['sessionId', 'start']
            }
        }, async ({ sessionId, start, end }: { sessionId: string; start: number; end?: number }) => {
            const { data, currentSessionUid } = this.contextProvider();

            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }
            if (!currentSessionUid) {
                return { error: 'No session is currently loaded. Load a session first using loadSessionById.' };
            }
            if (sessionId !== currentSessionUid) {
                return { error: `Session mismatch. You provided "${sessionId}" but currently loaded is "${currentSessionUid}".` };
            }
            const safeStart = Math.max(0, start || 0);
            const safeEnd = end ? Math.min(data.length, end) : safeStart + 1;

            const itemsToSave = data.slice(safeStart, safeEnd);

            const results = await Promise.allSettled(itemsToSave.map(item =>
                FirebaseService.updateLogItem(item.id, {
                    query: item.query,
                    reasoning: item.reasoning,
                    answer: item.answer,
                    messages: item.messages,
                    // We don't save score/verifier specific fields to the raw log usually, but we could if needed. 
                    // Keeping consistent with existing VerifierPanel logic.
                })
            ));

            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failCount = results.filter(r => r.status === 'rejected').length;

            if (successCount > 0) {
                const { setData } = this.contextProvider();
                setData((prevData: VerifierItem[]) => {
                    const idsToUpdate = new Set(itemsToSave.map(i => i.id));
                    return prevData.map(item => {
                        if (idsToUpdate.has(item.id)) {
                            return { ...item, hasUnsavedChanges: false };
                        }
                        return item;
                    });
                });
            }

            return {
                success: true,
                message: `Updated ${successCount} items in DB.` + (failCount > 0 ? ` Failed: ${failCount}` : '')
            };
        }, {
            requiresApproval: true,
            approvalSettingName: 'Save updates to DB'
        });

        // 16. getSessionByVerificationStatus
        this.registerTool({
            name: 'getSessionByVerificationStatus',
            description: 'Get the latest or oldest session filtered by verification status (unreviewed, verified, garbage).',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['unreviewed', 'verified', 'garbage'], description: 'Verification status to filter by' },
                    order: { type: 'string', enum: ['latest', 'oldest'], description: 'Sort order: latest or oldest first. Defaults to latest.' }
                },
                required: ['status']
            }
        }, async ({ status, order }: { status: string; order?: string }) => {
            const { sessions } = this.contextProvider();
            if (!sessions || sessions.length === 0) {
                return { error: 'Sessions list not available in this context.' };
            }

            const filtered = sessions.filter(s => {
                const vs = (s as any).verificationStatus || 'unreviewed';
                return vs === status;
            });

            if (filtered.length === 0) {
                return { error: `No sessions found with status "${status}".` };
            }

            const sorted = [...filtered].sort((a, b) => {
                const aTime = a.updatedAt || new Date(a.createdAt || 0).getTime();
                const bTime = b.updatedAt || new Date(b.createdAt || 0).getTime();
                return order === 'oldest' ? aTime - bTime : bTime - aTime;
            });

            const session = sorted[0];
            return {
                id: session.id,
                sessionUid: session.sessionUid,
                name: session.name,
                rows: session.itemCount ?? session.logCount ?? 0,
                updatedAt: session.updatedAt,
                createdAt: session.createdAt,
                status: session.status,
                verificationStatus: (session as any).verificationStatus || 'unreviewed',
                totalMatching: filtered.length
            };
        });

        // 17. markSessionVerificationStatus (requires approval)
        this.registerTool({
            name: 'markSessionVerificationStatus',
            description: 'Mark a session as verified, garbage, or unreviewed. Requires approval.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID (document ID) to update' },
                    status: { type: 'string', enum: ['verified', 'garbage', 'unreviewed'], description: 'New verification status' }
                },
                required: ['sessionId', 'status']
            }
        }, async ({ sessionId, status }: { sessionId: string; status: string }) => {
            await backendClient.updateSessionVerificationStatus(sessionId, status);
            const { refreshSessions } = this.contextProvider();
            if (refreshSessions) {
                await refreshSessions();
            }
            return { success: true, message: `Session ${sessionId} marked as ${status}.` };
        }, {
            requiresApproval: true,
            approvalSettingName: 'Mark session status'
        });

        // 18. runAutoScore (requires approval)
        this.registerTool({
            name: 'runAutoScore',
            description: 'Start an incremental auto-scoring background job on the backend. Scores unscored items in a session using the auto-score panel settings (provider, model, API key). Returns a jobId to check progress with checkJobStatus. Requires approval. If sessionId is not provided, uses the currently loaded session.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID (sessionUid) to score. Defaults to the currently loaded session if not specified.' },
                    limit: { type: 'number', description: 'Max items to score. Scores all unscored if not specified.' },
                    startIndex: { type: 'number', description: 'Start from this item index (0-based). Use with endIndex to score a specific range.' },
                    endIndex: { type: 'number', description: 'Stop at this item index (exclusive). Use with startIndex to score a specific range.' },
                    sleepMs: { type: 'number', description: 'Delay between scoring calls in ms. Uses auto-score panel setting if not specified.' },
                    force: { type: 'boolean', description: 'If true, re-score ALL items (including already scored). Default is false (only unscored).' }
                }
            }
        }, async ({ sessionId, limit, startIndex, endIndex, sleepMs, force }: {
            sessionId?: string; limit?: number; startIndex?: number; endIndex?: number; sleepMs?: number; force?: boolean;
        }) => {
            const ctx = this.contextProvider();
            const effectiveSessionId = sessionId || ctx.currentSessionUid;
            if (!effectiveSessionId) {
                return { error: 'No sessionId provided and no session is currently loaded. Load a session first or provide a sessionId.' };
            }
            const autoscoreConfig = ctx.getAutoscoreConfig?.();

            if (!autoscoreConfig) {
                return { error: 'Auto-score configuration not available. Open the Verifier panel to configure auto-scoring settings.' };
            }

            // Resolve provider string and base URL from autoscore config
            const providerString = autoscoreConfig.provider === ProviderType.External
                ? autoscoreConfig.externalProvider
                : ProviderType.Gemini;
            const effectiveModel = autoscoreConfig.model || '';
            const effectiveBaseUrl = autoscoreConfig.customBaseUrl
                || PROVIDERS[providerString]?.url
                || '';
            const apiKey = autoscoreConfig.apiKey
                || SettingsService.getApiKey(providerString)
                || '';

            if (!apiKey) {
                return { error: `No API key found for provider "${providerString}". Configure it in the auto-score settings panel.` };
            }
            if (!effectiveModel) {
                return { error: 'No model configured in auto-score settings.' };
            }
            if (!effectiveBaseUrl) {
                return { error: 'No base URL configured for the auto-score provider.' };
            }

            const effectiveSleepMs = sleepMs ?? autoscoreConfig.sleepTime ?? 500;

            // Convert startIndex/endIndex to offset/limit for the backend
            let effectiveOffset: number | undefined;
            let effectiveLimit: number | undefined = limit && limit > 0 ? limit : undefined;

            if (typeof startIndex === 'number' && startIndex > 0) {
                effectiveOffset = startIndex;
            }
            if (typeof endIndex === 'number' && endIndex > 0) {
                const rangeLimit = endIndex - (effectiveOffset || 0);
                if (rangeLimit > 0) {
                    effectiveLimit = effectiveLimit ? Math.min(effectiveLimit, rangeLimit) : rangeLimit;
                }
            }

            const encryptedKey = await encryptKey(apiKey);
            const effectiveConcurrency = autoscoreConfig.concurrency ?? 1;
            const effectiveMaxRetries = autoscoreConfig.maxRetries ?? 3;
            const effectiveRetryDelay = autoscoreConfig.retryDelay ?? 2000;

            const jobId = await backendClient.startAutoScore({
                sessionId: effectiveSessionId,
                provider: providerString,
                model: effectiveModel,
                baseUrl: effectiveBaseUrl,
                apiKey: encryptedKey,
                limit: effectiveLimit,
                offset: effectiveOffset,
                sleepMs: effectiveSleepMs,
                concurrency: effectiveConcurrency,
                maxRetries: effectiveMaxRetries,
                retryDelay: effectiveRetryDelay,
                force: !!force,
            });
            await trackJobInStorage({ id: jobId, type: 'autoscore', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
            return { jobId, message: `Auto-scoring job started using ${effectiveModel}. Use checkJobStatus to monitor progress.` };
        }, {
            requiresApproval: true,
            approvalSettingName: 'Run auto-scoring job'
        });

        // 19. runRewrite (requires approval)
        this.registerTool({
            name: 'runRewrite',
            description: 'Start an incremental rewriting background job on the backend. Rewrites selected fields (query, reasoning, answer) for items in a session. Returns a jobId to check progress with checkJobStatus. Requires approval. If sessionId is not provided, uses the currently loaded session.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Session ID (sessionUid) to rewrite. Defaults to the currently loaded session if not specified.' },
                    fields: { type: 'array', items: { type: 'string', enum: ['query', 'reasoning', 'answer'] }, description: 'Fields to rewrite (e.g. ["reasoning", "answer"])' },
                    provider: { type: 'string', description: 'AI provider name. Uses current provider if not specified.' },
                    model: { type: 'string', description: 'Model identifier. Uses current model if not specified.' },
                    baseUrl: { type: 'string', description: 'Provider API base URL. Uses current setting if not specified.' },
                    limit: { type: 'number', description: 'Max items to rewrite. Rewrites all if not specified.' },
                    startIndex: { type: 'number', description: 'Skip the first N items (0-based offset). Useful to resume from where a previous job left off.' },
                    sleepMs: { type: 'number', description: 'Delay between rewrite calls in ms (default: 500)' },
                    systemPrompt: { type: 'string', description: 'Custom system prompt for rewriting. Uses rewriter panel prompt or default if not specified.' }
                },
                required: ['fields']
            }
        }, async ({ sessionId, fields, provider, model, baseUrl, limit, startIndex, sleepMs, systemPrompt }: {
            sessionId?: string; fields: string[]; provider?: string; model?: string; baseUrl?: string; limit?: number; startIndex?: number; sleepMs?: number; systemPrompt?: string;
        }) => {
            const ctx = this.contextProvider();
            const effectiveSessionId = sessionId || ctx.currentSessionUid;
            if (!effectiveSessionId) {
                return { error: 'No sessionId provided and no session is currently loaded. Load a session first or provide a sessionId.' };
            }

            // Use rewriterConfig from the Rewriter panel as source of truth
            const rewriterConfig = ctx.getRewriterConfig?.();
            const settings = SettingsService.getSettings();

            // Resolve provider - explicit param > rewriterConfig > settings > default 'openrouter'
            const effectiveProvider = provider
                || (rewriterConfig?.externalProvider && String(rewriterConfig.externalProvider).trim() !== '' ? rewriterConfig.externalProvider : null)
                || settings.defaultProvider
                || 'openrouter';

            // Resolve model
            const effectiveModel = model
                || (rewriterConfig?.model && rewriterConfig.model !== '' ? rewriterConfig.model : null)
                || SettingsService.getDefaultModel(effectiveProvider)
                || '';

            // Resolve base URL
            const effectiveBaseUrl = baseUrl
                || (rewriterConfig?.customBaseUrl && rewriterConfig.customBaseUrl !== '' ? rewriterConfig.customBaseUrl : null)
                || SettingsService.getProviderUrl(effectiveProvider)
                || PROVIDERS[effectiveProvider]?.url
                || '';

            // Resolve API key - rewriterConfig > settings (only use rewriterConfig apiKey if non-empty)
            const apiKey = (rewriterConfig?.apiKey && rewriterConfig.apiKey !== '' ? rewriterConfig.apiKey : null)
                || SettingsService.getApiKey(effectiveProvider)
                || '';

            if (!apiKey) {
                return { error: `No API key found for provider "${effectiveProvider}". Configure it in the Rewriter panel or Settings.` };
            }
            if (!effectiveModel) {
                return { error: `No model specified and no default model configured for "${effectiveProvider}".` };
            }
            if (!effectiveBaseUrl) {
                return { error: `No base URL configured for provider "${effectiveProvider}".` };
            }

            const encryptedKey = await encryptKey(apiKey);
            const effectiveSleepMs = sleepMs ?? rewriterConfig?.delayMs ?? 500;
            const effectiveConcurrency = rewriterConfig?.concurrency ?? 1;
            const effectiveMaxRetries = rewriterConfig?.maxRetries ?? 3;
            const effectiveRetryDelay = rewriterConfig?.retryDelay ?? 2000;

            // Use explicit prompt > rewriterConfig prompt > undefined (use prompt set)
            const effectiveSystemPrompt = systemPrompt
                || (rewriterConfig?.systemPrompt && rewriterConfig.systemPrompt.trim() !== '' ? rewriterConfig.systemPrompt : undefined);

            // If no single system prompt override, load unified rewriter prompt from current prompt set
            let fieldPrompts: Record<string, string> | undefined;
            if (!effectiveSystemPrompt) {
                const promptSet = settings.promptSet || 'default';
                const schema = PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);
                if (schema.prompt) {
                    // Use the same unified prompt for all fields
                    fieldPrompts = {};
                    for (const field of fields) {
                        fieldPrompts[field] = schema.prompt;
                    }
                }
            }

            const jobId = await backendClient.startRewrite({
                sessionId: effectiveSessionId,
                provider: effectiveProvider,
                model: effectiveModel,
                baseUrl: effectiveBaseUrl,
                apiKey: encryptedKey,
                fields,
                limit,
                offset: startIndex,
                sleepMs: effectiveSleepMs,
                concurrency: effectiveConcurrency,
                maxRetries: effectiveMaxRetries,
                retryDelay: effectiveRetryDelay,
                systemPrompt: effectiveSystemPrompt,
                fieldPrompts,
            });
            await trackJobInStorage({ id: jobId, type: 'rewrite', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
            return { jobId, message: `Rewrite job started for fields: ${fields.join(', ')} using ${effectiveModel}. Use checkJobStatus to monitor progress.` };
        }, {
            requiresApproval: true,
            approvalSettingName: 'Run rewrite job'
        });

        // 20. checkJobStatus
        this.registerTool({
            name: 'checkJobStatus',
            description: 'Check the status and progress of a background job (auto-scoring, rewriting, etc.) by its job ID.',
            parameters: {
                type: 'object',
                properties: {
                    jobId: { type: 'string', description: 'The job ID returned by runAutoScore or runRewrite' }
                },
                required: ['jobId']
            }
        }, async ({ jobId }: { jobId: string }) => {
            const job = await backendClient.fetchJob(jobId) as any;

            // Return only essential fields for the assistant
            return {
                id: job.id,
                type: job.type,
                status: job.status,
                sessionId: job.sessionId,  // Session being processed
                progress: job.progress,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                // Omit: params, result (with trace/logs), config
            };
        });

        // 20a. listJobs - Query and filter jobs
        this.registerTool({
            name: 'listJobs',
            description: 'List and filter background jobs. Useful for checking stalled jobs, monitoring progress, or finding failed jobs that need attention. Returns array of job objects with id, type, status, sessionId, progress, error, createdAt, updatedAt.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['autoscore', 'rewrite', 'migrate-reasoning', 'remove-items', 'orphan_check', 'orphan_sync'],
                        description: 'Filter by job type. Optional - omit to get all types.'
                    },
                    status: {
                        type: 'string',
                        enum: ['pending', 'running', 'completed', 'failed'],
                        description: 'Filter by job status. Optional - omit to get all statuses. Use "failed" to find jobs that need resuming.'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of jobs to return (default: 50, max: 100)'
                    }
                }
            }
        }, async ({ type, status, limit }: { type?: string; status?: string; limit?: number }) => {
            const jobs = await backendClient.fetchJobs({ type, status, limit });

            // Return only essential fields for the assistant (omit trace, params, full results)
            const compactJobs = jobs.map((job: any) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                sessionId: job.sessionId,  // Session being processed
                progress: job.progress,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            }));

            return {
                jobs: compactJobs,
                count: compactJobs.length,
                summary: `Found ${compactJobs.length} job(s)${type ? ` of type "${type}"` : ''}${status ? ` with status "${status}"` : ''}`
            };
        });

        // 20b. resumeJob - Resume a failed job
        this.registerTool({
            name: 'resumeJob',
            description: 'Resume a failed or stalled job from where it stopped. Works for autoscore, rewrite, and migrate-reasoning jobs. Skips already-processed items and continues with the same parameters. The job will continue from its last checkpoint.',
            parameters: {
                type: 'object',
                properties: {
                    jobId: {
                        type: 'string',
                        description: 'The job ID to resume. Use listJobs with status="failed" to find resumable jobs.'
                    }
                },
                required: ['jobId']
            }
        }, async ({ jobId }: { jobId: string }) => {
            // Get the job details to determine type
            const job = await backendClient.fetchJob(jobId) as any;

            if (job.status === 'completed') {
                return { error: 'Job is already completed. Use checkJobStatus to view results.' };
            }

            if (job.type === 'autoscore') {
                // Autoscore needs API key from settings
                const params = job.params as Record<string, unknown> | undefined;
                const provider = (params?.provider as string) || '';
                const apiKey = SettingsService.getApiKey(provider);

                if (!apiKey) {
                    return { error: `No API key found for provider "${provider}". Configure it in Settings before resuming.` };
                }

                const encryptedKey = await encryptKey(apiKey);
                const newJobId = await backendClient.startAutoScore({
                    resumeJobId: jobId,
                    apiKey: encryptedKey,
                });

                return {
                    jobId: newJobId,
                    message: `Auto-scoring job resumed from checkpoint. Previous progress preserved. Use checkJobStatus to monitor.`
                };
            } else if (job.type === 'rewrite') {
                // Rewrite needs API key from settings
                const params = job.params as Record<string, unknown> | undefined;
                const provider = (params?.provider as string) || '';
                const apiKey = SettingsService.getApiKey(provider);

                if (!apiKey) {
                    return { error: `No API key found for provider "${provider}". Configure it in Settings before resuming.` };
                }

                const encryptedKey = await encryptKey(apiKey);
                const newJobId = await backendClient.startRewrite({
                    resumeJobId: jobId,
                    apiKey: encryptedKey,
                });

                return {
                    jobId: newJobId,
                    message: `Rewrite job resumed from checkpoint. Previous progress preserved. Use checkJobStatus to monitor.`
                };
            } else if (job.type === 'migrate-reasoning') {
                const newJobId = await backendClient.startMigrateReasoning({
                    resumeJobId: jobId,
                });

                return {
                    jobId: newJobId,
                    message: `Reasoning migration job resumed from checkpoint. Previous progress preserved. Use checkJobStatus to monitor.`
                };
            } else {
                return {
                    error: `Job type "${job.type}" does not support resume. Only autoscore, rewrite, and migrate-reasoning jobs can be resumed.`
                };
            }
        });

        // 20c. cancelJob - Stop a running job
        this.registerTool({
            name: 'cancelJob',
            description: 'Cancel a running or pending job. The job will be marked as failed and stopped. Use with caution - cancelled jobs may leave partial work.',
            parameters: {
                type: 'object',
                properties: {
                    jobId: {
                        type: 'string',
                        description: 'The job ID to cancel. Use listJobs with status="running" to find active jobs.'
                    }
                },
                required: ['jobId']
            }
        }, async ({ jobId }: { jobId: string }) => {
            await backendClient.cancelJob(jobId);
            return {
                success: true,
                message: `Job ${jobId} has been cancelled. You can resume it later if needed.`
            };
        });

        // 21. runRemoveItems (requires approval) - starts a background job
        this.registerTool({
            name: 'runRemoveItems',
            description: 'Start a background job to remove items from a session. Can remove by specific indices OR by score threshold. Items are deleted from the database. Returns a jobId to check progress with checkJobStatus. Requires approval.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to remove items from. Use getCurrentSessionId to get this value.'
                    },
                    indices: {
                        type: 'array',
                        items: { type: 'number' },
                        description: 'List of item indices to remove. Mutually exclusive with scoreThreshold.'
                    },
                    scoreThreshold: {
                        type: 'number',
                        description: 'Remove all items with score below this threshold (0-10 scale). Mutually exclusive with indices.'
                    },
                    scoreField: {
                        type: 'string',
                        enum: ['score'],
                        description: 'Which score field to use when filtering by scoreThreshold. Defaults to "score".'
                    },
                    dryRun: {
                        type: 'boolean',
                        description: 'If true, only returns what would be deleted without actually removing anything. Useful for previewing the operation.'
                    }
                },
                required: ['sessionId']
            }
        }, async ({
            sessionId,
            indices,
            scoreThreshold,
            scoreField = 'score',
            dryRun = false
        }: {
            sessionId: string;
            indices?: number[];
            scoreThreshold?: number;
            scoreField?: string;
            dryRun?: boolean;
        }) => {
            // Validate sessionId is provided
            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }

            // Validate that exactly one of indices or scoreThreshold is provided
            if (indices && scoreThreshold !== undefined) {
                return { error: 'Cannot use both indices and scoreThreshold. Choose one method.' };
            }
            if (!indices && scoreThreshold === undefined) {
                return { error: 'Must provide either indices or scoreThreshold.' };
            }

            try {
                const jobId = await backendClient.startRemoveItems({
                    sessionId,
                    indices,
                    scoreThreshold,
                    scoreField,
                    dryRun,
                });
                await trackJobInStorage({ id: jobId, type: 'remove-items', status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
                return {
                    jobId,
                    message: dryRun
                        ? `Dry-run job started. Use checkJobStatus to see what would be removed.`
                        : `Remove items job started. Use checkJobStatus to monitor progress.`
                };
            } catch (err: any) {
                return { error: `Failed to start remove items job: ${err.message}` };
            }
        }, {
            requiresApproval: true,
            approvalSettingName: 'Remove items from dataset'
        });

        // 22. getScoreDistribution - queries the backend for full session data
        this.registerTool({
            name: 'getScoreDistribution',
            description: 'Get a summary of score distribution for ALL items in a session (queries the database directly). Useful before using runRemoveItems with scoreThreshold. Returns statistics, distribution by score ranges, and preview of how many items would be affected at various thresholds.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: {
                        type: 'string',
                        description: 'Session ID (sessionUid) to analyze. Use getCurrentSessionId to get this value.'
                    },
                    scoreField: {
                        type: 'string',
                        enum: ['score'],
                        description: 'Which score field to analyze. Defaults to "score".'
                    }
                },
                required: ['sessionId']
            }
        }, async ({ sessionId, scoreField = 'score' }: { sessionId: string; scoreField?: string }) => {
            if (!sessionId) {
                return { error: 'sessionId is required. Use getCurrentSessionId to get the session ID.' };
            }

            try {
                const result = await backendClient.getScoreDistribution(sessionId, scoreField);
                return result;
            } catch (err: any) {
                return { error: `Failed to get score distribution: ${err.message}` };
            }
        });
    }

    public registerTool(definition: ToolDefinition, execute: ToolFunction, options?: ToolRegistrationOptions) {
        const approval: ToolApprovalInfo | undefined = options?.requiresApproval
            ? { requiresApproval: true, approvalSettingName: options.approvalSettingName }
            : undefined;
        this.tools.set(definition.name, { definition, execute, approval });
    }

    public getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => t.definition);
    }

    public getToolApproval(name: string): ToolApprovalInfo | null {
        const tool = this.tools.get(name);
        if (!tool) return null;
        if (!tool.approval) {
            return { requiresApproval: false };
        }
        return {
            requiresApproval: tool.approval.requiresApproval,
            approvalSettingName: tool.approval.approvalSettingName
        };
    }

    public getOpenAIToolDefinitions(): any[] {
        return Array.from(this.tools.values()).map(t => ({
            type: 'function',
            function: {
                name: t.definition.name,
                description: t.definition.description,
                parameters: t.definition.parameters
            }
        }));
    }

    public async executeTool(name: string, args: any): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool ${name} not found.`);
        }
        try {
            console.log(`[ToolExecutor] Executing ${name} with args:`, args);
            const result = await tool.execute(args);
            return result;
        } catch (error: any) {
            console.error(`[ToolExecutor] Error executing ${name}:`, error);
            return { error: error.message || String(error) };
        }
    }
}
