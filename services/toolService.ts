import type { AutoscoreToolParams, AutoscoreToolResult, SessionListToolParams, VerifierItem } from '../types';
import { ToolFieldName } from '../interfaces/enums';
import * as FirebaseService from './firebaseService';
import type { SessionData } from '../interfaces';

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
    autoSaveEnabled?: boolean;
    handleDbUpdate?: (item: VerifierItem) => Promise<void>;
    fetchMoreFromDb?: (start: number, end: number) => Promise<void>;
    sessions?: SessionData[];
    refreshSessions?: () => Promise<SessionData[]>;
    renameSession?: (sessionId: string, newName: string) => Promise<void>;
    autoscoreItems?: (params: AutoscoreToolParams) => Promise<AutoscoreToolResult>;
    loadSessionById?: (sessionId: string) => Promise<void>;
    loadSessionRows?: (sessionId: string, offset: number, limit: number) => Promise<VerifierItem[]>;
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
            description: 'Get the total number of items in the current verification dataset.',
            parameters: {
                type: 'object',
                properties: {},
            }
        }, async () => {
            const { data } = this.contextProvider();
            return { count: data.length };
        });

        // 2. getItems
        this.registerTool({
            name: 'getItems',
            description: 'Get a list of items from the dataset. Returns partial fields by default to save tokens.',
            parameters: {
                type: 'object',
                properties: {
                    start: { type: 'number', description: 'Start index (0-based)' },
                    end: { type: 'number', description: 'End index (exclusive)' },
                    field: { type: 'string', enum: [ToolFieldName.Query, ToolFieldName.Reasoning, ToolFieldName.Answer, ToolFieldName.All, ToolFieldName.Messages], description: 'Specific field to retrieve. Defaults to "all" if not specified.' }
                },
                required: ['start']
            }
        }, async ({ start, end, field }) => {
            const { data } = this.contextProvider();
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
            description: 'Get a single specific item by index with full details.',
            parameters: {
                type: 'object',
                properties: {
                    index: { type: 'number', description: 'Index of the item' }
                },
                required: ['index']
            }
        }, async ({ index }) => {
            const { data } = this.contextProvider();
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

        // 4. updateItem
        this.registerTool({
            name: 'updateItem',
            description: 'Update a specific field of an item in the local state. Updates are immediately reflected in UI.',
            parameters: {
                type: 'object',
                properties: {
                    index: { type: 'number' },
                    field: { type: 'string', enum: [ToolFieldName.Query, ToolFieldName.Reasoning, ToolFieldName.Answer] },
                    value: { type: 'string', description: 'The new value for the field' }
                },
                required: ['index', 'field', 'value']
            }
        }, async ({ index, field, value }) => {
            const { setData } = this.contextProvider();

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
            description: 'Fetch more rows from the database. Use this when the current list is exhausted or you need to process more items.',
            parameters: {
                type: 'object',
                properties: {
                    start: { type: 'number', description: 'Start index' },
                    end: { type: 'number', description: 'End index' }
                },
                required: ['start']
            }
        }, async ({ start, end }) => {
            const { fetchMoreFromDb } = this.contextProvider() as any;
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
            description: 'Set scores for a set of items by indices. Scores are applied to items locally.',
            parameters: {
                type: 'object',
                properties: {
                    indices: { type: 'array', items: { type: 'number' }, description: 'Item indices to score' },
                    scores: { type: 'array', items: { type: 'number' }, description: 'Scores corresponding to indices' }
                },
                required: ['indices', 'scores']
            }
        }, async (params: AutoscoreToolParams = {}) => {
            const { autoscoreItems } = this.contextProvider();
            if (!autoscoreItems) {
                return { error: 'Autoscore not available in this context.' };
            }
            return autoscoreItems(params);
        });

        // 15. updateItemsInDb
        this.registerTool({
            name: 'updateItemsInDb',
            description: 'Persist changes for a range of items to the database (Firebase). Use this after making local updates.',
            parameters: {
                type: 'object',
                properties: {
                    start: { type: 'number', description: 'Start index' },
                    end: { type: 'number', description: 'End index' }
                },
                required: ['start']
            }
        }, async ({ start, end }) => {
            const { data } = this.contextProvider();
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
