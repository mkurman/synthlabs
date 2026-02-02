import { useEffect, useRef, useCallback } from 'react';
import { SessionData } from '../types';
import { StorageMode } from '../interfaces/enums/StorageMode';
import * as IndexedDBUtils from '../services/session/indexedDBUtils';

interface UseSessionAutoSaveOptions {
    session: SessionData | null;
    enabled?: boolean;
    debounceMs?: number;
    onSave?: (session: SessionData) => void;
    onError?: (error: Error) => void;
}

/**
 * Hook for auto-saving session data with debouncing
 */
export function useSessionAutoSave(options: UseSessionAutoSaveOptions) {
    const {
        session,
        enabled = true,
        debounceMs = 2000,
        onSave,
        onError
    } = options;

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedRef = useRef<string>('');
    const isSavingRef = useRef(false);

    /**
     * Perform the actual save operation
     */
    const performSave = useCallback(async (sessionToSave: SessionData) => {
        if (isSavingRef.current) return;

        isSavingRef.current = true;
        try {
            // Determine storage mode
            const storageMode = sessionToSave.storageMode || StorageMode.Local;

            if (storageMode === StorageMode.Local) {
                await IndexedDBUtils.saveSession(sessionToSave);
            } else {
                // Save to Firebase (to be implemented)
                // For now, fall back to local
                await IndexedDBUtils.saveSession(sessionToSave);
            }

            // Update last saved reference
            lastSavedRef.current = JSON.stringify(sessionToSave);

            // Notify callback
            if (onSave) {
                onSave(sessionToSave);
            }
        } catch (error) {
            console.error('Auto-save failed:', error);
            if (onError) {
                onError(error as Error);
            }
        } finally {
            isSavingRef.current = false;
        }
    }, [onSave, onError]);

    /**
     * Schedule a save operation (debounced)
     */
    const scheduleSave = useCallback((sessionToSave: SessionData) => {
        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Schedule new save
        saveTimeoutRef.current = setTimeout(() => {
            performSave(sessionToSave);
        }, debounceMs);
    }, [debounceMs, performSave]);

    /**
     * Force immediate save (bypass debounce)
     */
    const saveNow = useCallback(async () => {
        if (!session || !enabled) return;

        // Clear pending debounced save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        await performSave(session);
    }, [session, enabled, performSave]);

    // Auto-save when session changes
    useEffect(() => {
        if (!session || !enabled) return;

        // Check if session actually changed
        const sessionJson = JSON.stringify(session);
        if (sessionJson === lastSavedRef.current) {
            return;
        }

        // Schedule save
        scheduleSave(session);

        // Cleanup on unmount
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [session, enabled, scheduleSave]);

    // Save on unmount (flush pending saves)
    useEffect(() => {
        return () => {
            if (session && enabled && saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                performSave(session);
            }
        };
    }, [session, enabled, performSave]);

    return {
        saveNow,
        isSaving: isSavingRef.current
    };
}
