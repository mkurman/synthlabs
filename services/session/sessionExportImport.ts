import { SessionData } from '../../types';
import { AppView } from '../../interfaces/enums';
import { StorageMode } from '../../interfaces/enums/StorageMode';
import * as IndexedDBUtils from './indexedDBUtils';

interface SessionExportData {
    session: SessionData;
    items: any[];
    exportedAt: number;
    version: string;
}

interface SessionImportResult {
    success: boolean;
    session?: SessionData;
    itemCount?: number;
    error?: string;
}

const EXPORT_VERSION = '1.0.0';

/**
 * Export session to JSON file
 */
export async function exportSessionToJSON(
    sessionId: string,
    includeItems: boolean = true
): Promise<Blob> {
    // Load session
    const session = await IndexedDBUtils.loadSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found`);
    }

    // Load items if requested
    let items: any[] = [];
    if (includeItems) {
        const result = await IndexedDBUtils.loadItems(sessionId, 0, Number.MAX_SAFE_INTEGER);
        items = result.items;
    }

    // Create export data
    const exportData: SessionExportData = {
        session,
        items,
        exportedAt: Date.now(),
        version: EXPORT_VERSION
    };

    // Convert to JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
}

/**
 * Download session as JSON file
 */
export async function downloadSessionJSON(
    sessionId: string,
    includeItems: boolean = true
): Promise<void> {
    const blob = await exportSessionToJSON(sessionId, includeItems);

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session_${sessionId}_${Date.now()}.json`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up
    URL.revokeObjectURL(url);
}

/**
 * Export multiple sessions to JSONL (one session per line)
 */
export async function exportSessionsToJSONL(
    sessionIds: string[],
    includeItems: boolean = true
): Promise<Blob> {
    const lines: string[] = [];

    for (const sessionId of sessionIds) {
        try {
            const session = await IndexedDBUtils.loadSession(sessionId);
            if (!session) continue;

            let items: any[] = [];
            if (includeItems) {
                const result = await IndexedDBUtils.loadItems(sessionId, 0, Number.MAX_SAFE_INTEGER);
                items = result.items;
            }

            const exportData: SessionExportData = {
                session,
                items,
                exportedAt: Date.now(),
                version: EXPORT_VERSION
            };

            lines.push(JSON.stringify(exportData));
        } catch (error) {
            console.error(`Failed to export session ${sessionId}:`, error);
        }
    }

    const jsonlString = lines.join('\n');
    return new Blob([jsonlString], { type: 'application/jsonl' });
}

/**
 * Import session from JSON file
 */
export async function importSessionFromJSON(
    file: File,
    overwriteIfExists: boolean = false
): Promise<SessionImportResult> {
    try {
        // Read file
        const text = await file.text();
        const exportData: SessionExportData = JSON.parse(text);

        // Validate export data
        if (!exportData.session || !exportData.version) {
            return {
                success: false,
                error: 'Invalid session export file format'
            };
        }

        // Check if session already exists
        const existingSession = await IndexedDBUtils.loadSession(exportData.session.id);
        if (existingSession && !overwriteIfExists) {
            return {
                success: false,
                error: 'Session already exists. Use overwrite option to replace it.'
            };
        }

        // Import session
        await IndexedDBUtils.saveSession(exportData.session);

        // Import items if present
        if (exportData.items && exportData.items.length > 0) {
            await IndexedDBUtils.saveItems(exportData.session.id, exportData.items);
        }

        return {
            success: true,
            session: exportData.session,
            itemCount: exportData.items?.length || 0
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during import'
        };
    }
}

/**
 * Import multiple sessions from JSONL file
 */
export async function importSessionsFromJSONL(
    file: File,
    overwriteIfExists: boolean = false
): Promise<SessionImportResult[]> {
    const results: SessionImportResult[] = [];

    try {
        // Read file
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        // Process each line
        for (const line of lines) {
            try {
                const exportData: SessionExportData = JSON.parse(line);

                // Validate
                if (!exportData.session || !exportData.version) {
                    results.push({
                        success: false,
                        error: 'Invalid session format in line'
                    });
                    continue;
                }

                // Check if exists
                const existingSession = await IndexedDBUtils.loadSession(exportData.session.id);
                if (existingSession && !overwriteIfExists) {
                    results.push({
                        success: false,
                        error: `Session ${exportData.session.id} already exists`
                    });
                    continue;
                }

                // Import
                await IndexedDBUtils.saveSession(exportData.session);

                if (exportData.items && exportData.items.length > 0) {
                    await IndexedDBUtils.saveItems(exportData.session.id, exportData.items);
                }

                results.push({
                    success: true,
                    session: exportData.session,
                    itemCount: exportData.items?.length || 0
                });
            } catch (error) {
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : 'Parse error'
                });
            }
        }
    } catch (error) {
        results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to read file'
        });
    }

    return results;
}

/**
 * Clone a session (create a copy with new ID)
 */
export async function cloneSession(
    sessionId: string,
    newName?: string
): Promise<SessionData> {
    // Load original session
    const originalSession = await IndexedDBUtils.loadSession(sessionId);
    if (!originalSession) {
        throw new Error(`Session ${sessionId} not found`);
    }

    // Load items
    const result = await IndexedDBUtils.loadItems(sessionId, 0, Number.MAX_SAFE_INTEGER);

    // Create new session with new ID
    const now = Date.now();
    const clonedSession: SessionData = {
        ...originalSession,
        id: `session_${now}_${Math.random().toString(36).substr(2, 9)}`,
        name: newName || `${originalSession.name} (Copy)`,
        createdAt: now,
        updatedAt: now
    };

    // Save cloned session
    await IndexedDBUtils.saveSession(clonedSession);

    // Save items with new session ID
    if (result.items.length > 0) {
        await IndexedDBUtils.saveItems(clonedSession.id, result.items);
    }

    return clonedSession;
}

/**
 * Merge multiple sessions into one
 */
export async function mergeSessions(
    sessionIds: string[],
    targetMode: AppView,
    newName: string
): Promise<SessionData> {
    if (sessionIds.length === 0) {
        throw new Error('No sessions to merge');
    }

    // Load all sessions and items
    const allItems: any[] = [];
    let totalTokens = 0;
    let totalCost = 0;

    for (const sessionId of sessionIds) {
        const session = await IndexedDBUtils.loadSession(sessionId);
        if (!session) continue;

        const result = await IndexedDBUtils.loadItems(sessionId, 0, Number.MAX_SAFE_INTEGER);
        allItems.push(...result.items);

        if (session.analytics) {
            totalTokens += session.analytics.totalTokens;
            totalCost += session.analytics.totalCost;
        }
    }

    // Create merged session
    const mergedSession = IndexedDBUtils.createNewSession(
        newName,
        targetMode,
        StorageMode.Local // Will be updated based on environment
    );

    // Update analytics
    if (mergedSession.analytics) {
        mergedSession.analytics.totalItems = allItems.length;
        mergedSession.analytics.totalTokens = totalTokens;
        mergedSession.analytics.totalCost = totalCost;
    }

    // Save merged session
    await IndexedDBUtils.saveSession(mergedSession);

    // Save all items
    if (allItems.length > 0) {
        await IndexedDBUtils.saveItems(mergedSession.id, allItems);
    }

    return mergedSession;
}
