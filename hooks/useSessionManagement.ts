import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { SessionService } from '../services/sessionService';
import { confirmService } from '../services/confirmService';
import * as FirebaseService from '../services/firebaseService';
import { logger } from '../utils/logger';
import type { SessionSetters, SessionData } from '../interfaces/services/SessionConfig';

interface UseSessionManagementOptions {
    setSessionUid: (uid: string) => void;
    setSessionName: (name: string | null) => void;
    setError: (error: string | null) => void;
    setShowCloudLoadModal: (show: boolean) => void;
    setIsCloudLoading: (loading: boolean) => void;
    setCloudSessions: Dispatch<SetStateAction<SessionData[]>>;
    setDbStats: (stats: { total: number; session: number }) => void;
    getSessionData: () => SessionData;
    setters: SessionSetters;
}

export function useSessionManagement({
    setSessionUid,
    setSessionName,
    setError,
    setShowCloudLoadModal,
    setIsCloudLoading,
    setCloudSessions,
    setDbStats,
    getSessionData,
    setters
}: UseSessionManagementOptions) {
    const restoreSession = useCallback((session: Partial<SessionData>, savedSessionUid?: string) => {
        SessionService.restoreSession(
            session,
            savedSessionUid,
            setters,
            { setSessionUid, setError }
        );
    }, [setError, setSessionUid, setters]);

    const handleSaveSession = useCallback(() => {
        const sessionData = getSessionData();
        SessionService.saveToFile(sessionData);
    }, [getSessionData]);

    const handleLoadSession = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const session = await SessionService.loadFromFile(file);
            restoreSession(session);
            setSessionName('Local File Session');
        } catch (err) {
            console.error('Failed to load session', err);
            setError('Failed to load session file. Invalid JSON.');
        }
        e.target.value = '';
    }, [restoreSession, setError, setSessionName]);

    const handleCloudSave = useCallback(async () => {
        if (!SessionService.isCloudAvailable()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }
        const name = prompt('Enter a name for this session snapshot:');
        if (!name) return;
        try {
            const sessionData = getSessionData();
            await SessionService.saveToCloud(sessionData, name);
            setSessionName(name);
            await confirmService.alert({
                title: 'Saved',
                message: 'Session saved to cloud!',
                variant: 'info'
            });
        } catch (e: any) {
            await confirmService.alert({
                title: 'Save failed',
                message: `Failed to save to cloud: ${e.message}`,
                variant: 'danger'
            });
        }
    }, [getSessionData, setSessionName]);

    const handleCloudLoadOpen = useCallback(async () => {
        if (!SessionService.isCloudAvailable()) {
            await confirmService.alert({
                title: 'Firebase not configured',
                message: 'Please configure Firebase in Settings to enable cloud sync.',
                variant: 'warning'
            });
            return;
        }
        setIsCloudLoading(true);
        setShowCloudLoadModal(true);
        try {
            const sessions = await SessionService.listCloudSessions();
            setCloudSessions(sessions);
        } catch (e: any) {
            await confirmService.alert({
                title: 'Fetch failed',
                message: `Failed to fetch sessions: ${e.message}`,
                variant: 'danger'
            });
            setShowCloudLoadModal(false);
        } finally {
            setIsCloudLoading(false);
        }
    }, [setCloudSessions, setIsCloudLoading, setShowCloudLoadModal]);

    const handleCloudSessionSelect = useCallback(async (session: SessionData | any) => {
        setIsCloudLoading(true);
        try {
            let fullSession = session;

            // If config is missing (lightweight list item), fetch full details
            if (!session.config) {
                try {
                    const loaded = await SessionService.loadFromCloud(session.id);
                    if (loaded && loaded.sessionData) {
                        fullSession = {
                            ...session,
                            ...loaded,
                            config: loaded.sessionData.config || {},
                            sessionUid: loaded.sessionUid || session.sessionUid
                        };
                    } else {
                        // Fallback if sessionData is corrupt/missing
                        fullSession = {
                            ...session,
                            ...loaded,
                            config: {},
                            sessionUid: loaded?.sessionUid || session.sessionUid
                        };
                        logger.warn("Session loaded but configuration data is missing or corrupt.");
                    }
                } catch (e) {
                    logger.error("Failed to load full session details", e);
                    await confirmService.alert({
                        title: 'Load Failed',
                        message: 'Could not load session details from cloud.',
                        variant: 'danger'
                    });
                    setIsCloudLoading(false);
                    return;
                }
            }

            setSessionName(fullSession.name);
            const savedSessionUid = fullSession.sessionUid || (fullSession as any).sessionUid;

            // Restore session state
            restoreSession(fullSession.config || fullSession.sessionData?.config || {}, savedSessionUid);
            setShowCloudLoadModal(false);

            if (savedSessionUid && SessionService.isCloudAvailable()) {
                try {
                    const stats = await FirebaseService.getDbStats(savedSessionUid);
                    setDbStats(stats);
                } catch (e) {
                    logger.warn('Failed to fetch session stats on load', e);
                }
            }
        } finally {
            setIsCloudLoading(false);
        }
    }, [restoreSession, setDbStats, setSessionName, setShowCloudLoadModal, setIsCloudLoading]);

    const handleCloudSessionDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmDelete = await confirmService.confirm({
            title: 'Delete session?',
            message: 'Are you sure you want to delete this session? This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (!confirmDelete) return;
        try {
            await SessionService.deleteFromCloud(id);
            setCloudSessions(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            await confirmService.alert({
                title: 'Delete failed',
                message: `Failed to delete session: ${e.message}`,
                variant: 'danger'
            });
        }
    }, [setCloudSessions]);

    return {
        restoreSession,
        handleSaveSession,
        handleLoadSession,
        handleCloudSave,
        handleCloudLoadOpen,
        handleCloudSessionSelect,
        handleCloudSessionDelete
    };
}

export default useSessionManagement;
