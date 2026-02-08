import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';

import * as FirebaseService from '../../../../services/firebaseService';
import { toast } from '../../../../services/toastService';
import { confirmService } from '../../../../services/confirmService';
import { VerifierDataSource } from '../../../../interfaces/enums/VerifierDataSource';
import { VerifierPanelTab } from '../../../../interfaces/enums/VerifierPanelTab';
import { SessionVerificationStatus } from '../../../../interfaces/enums/SessionVerificationStatus';
import type { SessionData } from '../../../../interfaces';
import type { VerifierItem } from '../../../../types';

interface UseVerifierSessionStatusActionsOptions {
    resolveActiveSessionId: () => string | null;
    availableSessions: SessionData[];
    setAvailableSessions: Dispatch<SetStateAction<SessionData[]>>;
    setSelectedSessionFilter: Dispatch<SetStateAction<string>>;
    setCustomSessionId: Dispatch<SetStateAction<string>>;
    setData: Dispatch<SetStateAction<VerifierItem[]>>;
    setDataSource: Dispatch<SetStateAction<VerifierDataSource | null>>;
    setActiveTab: Dispatch<SetStateAction<VerifierPanelTab>>;
    setIsUpdatingSessionStatus: Dispatch<SetStateAction<boolean>>;
}

interface UseVerifierSessionStatusActionsResult {
    activeSessionStatus: SessionVerificationStatus | null;
    updateSessionStatus: (status: SessionVerificationStatus) => Promise<void>;
    handleMarkGarbage: () => Promise<void>;
    handleDeleteSession: () => Promise<void>;
    handleMarkUnreviewed: () => Promise<void>;
    handleMarkVerified: () => Promise<void>;
    handleRestoreSession: () => Promise<void>;
}

export function useVerifierSessionStatusActions({
    resolveActiveSessionId,
    availableSessions,
    setAvailableSessions,
    setSelectedSessionFilter,
    setCustomSessionId,
    setData,
    setDataSource,
    setActiveTab,
    setIsUpdatingSessionStatus
}: UseVerifierSessionStatusActionsOptions): UseVerifierSessionStatusActionsResult {
    const updateSessionStatus = useCallback(async (status: SessionVerificationStatus) => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to update its status.');
            return;
        }
        if (!FirebaseService.isFirebaseConfigured()) {
            toast.error('Firebase not configured.');
            return;
        }
        setIsUpdatingSessionStatus(true);
        try {
            await FirebaseService.updateSessionVerificationStatus(sessionId, status);
            setAvailableSessions(prev => prev.map(s => (s.id === sessionId || s.sessionUid === sessionId)
                ? { ...s, verificationStatus: status }
                : s
            ));
            toast.success(status === SessionVerificationStatus.Verified ? 'Session marked verified.' : 'Session marked as garbage.');
        } catch (err) {
            console.error('Failed to update session status', err);
            toast.error('Failed to update session status.');
        } finally {
            setIsUpdatingSessionStatus(false);
        }
    }, [resolveActiveSessionId, setAvailableSessions, setIsUpdatingSessionStatus]);

    const handleMarkGarbage = useCallback(async () => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to update.');
            return;
        }
        const confirm = await confirmService.confirm({
            title: 'Mark session as garbage?',
            message: 'This will mark the session as garbage. You can still delete it separately.',
            confirmLabel: 'Mark Garbage',
            cancelLabel: 'Cancel',
            variant: 'warning'
        });
        if (!confirm) return;
        await updateSessionStatus(SessionVerificationStatus.Garbage);
    }, [resolveActiveSessionId, updateSessionStatus]);

    const handleDeleteSession = useCallback(async () => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) {
            toast.error('Select a specific session to delete.');
            return;
        }
        const confirm = await confirmService.confirm({
            title: 'Delete session and logs?',
            message: 'This will permanently delete the session and all its logs. This cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger'
        });
        if (!confirm) return;

        setIsUpdatingSessionStatus(true);
        try {
            await FirebaseService.deleteSessionWithLogs(sessionId);
            setAvailableSessions(prev => prev.filter(s => s.id !== sessionId && s.sessionUid !== sessionId));
            setSelectedSessionFilter('all');
            setCustomSessionId('');
            setData([]);
            setDataSource(null);
            setActiveTab(VerifierPanelTab.Import);
            toast.success('Session and logs deleted.');
        } catch (err) {
            console.error('Failed to delete session', err);
            toast.error('Failed to delete session.');
        } finally {
            setIsUpdatingSessionStatus(false);
        }
    }, [
        resolveActiveSessionId,
        setActiveTab,
        setAvailableSessions,
        setCustomSessionId,
        setData,
        setDataSource,
        setIsUpdatingSessionStatus,
        setSelectedSessionFilter
    ]);

    const handleMarkUnreviewed = useCallback(async () => {
        const confirm = await confirmService.confirm({
            title: 'Mark session as unreviewed?',
            message: 'This will mark the current session as unreviewed.',
            confirmLabel: 'Mark Unreviewed',
            cancelLabel: 'Cancel',
            variant: 'info'
        });
        if (!confirm) {
            return;
        }
        await updateSessionStatus(SessionVerificationStatus.Unreviewed);
    }, [updateSessionStatus]);

    const handleMarkVerified = useCallback(async () => {
        const confirm = await confirmService.confirm({
            title: 'Mark session as verified?',
            message: 'This marks the current session as verified.',
            confirmLabel: 'Verify',
            cancelLabel: 'Cancel',
            variant: 'info'
        });
        if (!confirm) {
            return;
        }
        await updateSessionStatus(SessionVerificationStatus.Verified);
    }, [updateSessionStatus]);

    const handleRestoreSession = useCallback(async () => {
        const confirm = await confirmService.confirm({
            title: 'Restore session?',
            message: 'This will mark the session as unreviewed.',
            confirmLabel: 'Restore',
            cancelLabel: 'Cancel',
            variant: 'info'
        });
        if (!confirm) {
            return;
        }
        await updateSessionStatus(SessionVerificationStatus.Unreviewed);
    }, [updateSessionStatus]);

    const activeSessionStatus = useMemo(() => {
        const sessionId = resolveActiveSessionId();
        if (!sessionId) return null;
        const match = availableSessions.find(s => s.id === sessionId || s.sessionUid === sessionId);
        return match?.verificationStatus || SessionVerificationStatus.Unreviewed;
    }, [availableSessions, resolveActiveSessionId]);

    return {
        activeSessionStatus,
        updateSessionStatus,
        handleMarkGarbage,
        handleDeleteSession,
        handleMarkUnreviewed,
        handleMarkVerified,
        handleRestoreSession
    };
}

export default useVerifierSessionStatusActions;
