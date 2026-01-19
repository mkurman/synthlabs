import { VerifierItem } from '../types';
import * as FirebaseService from './firebaseService';

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
}

export interface ToolContext {
    data: VerifierItem[];
    setData: any;
    autoSaveEnabled?: boolean;
    handleDbUpdate?: (item: VerifierItem) => Promise<void>;
    fetchMoreFromDb?: (start: number, end: number) => Promise<void>;
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
                    field: { type: 'string', enum: ['query', 'reasoning', 'answer', 'all'], description: 'Specific field to retrieve. Defaults to "all" if not specified.' }
                },
                required: ['start']
            }
        }, async ({ start, end, field }) => {
            const { data } = this.contextProvider();
            const safeStart = Math.max(0, start || 0);
            const safeEnd = end ? Math.min(data.length, end) : Math.min(data.length, safeStart + 5); // Default 5 items

            const items = data.slice(safeStart, safeEnd);

            if (field && field !== 'all') {
                return items.map((item, idx) => ({
                    index: safeStart + idx,
                    [field]: item[field as keyof VerifierItem]
                }));
            }

            // Return a summary by default to avoid huge token usage
            return items.map((item, idx) => ({
                index: safeStart + idx,
                id: item.id,
                query: item.query ? item.query : '',
                reasoning_length: item.reasoning?.length || 0,
                answer: item.answer ? item.answer : ''
            }));
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
                    field: { type: 'string', enum: ['query', 'reasoning', 'answer'] },
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

        // 6. updateItemsInDb
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
        });
    }

    public registerTool(definition: ToolDefinition, execute: ToolFunction) {
        this.tools.set(definition.name, { definition, execute });
    }

    public getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => t.definition);
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
