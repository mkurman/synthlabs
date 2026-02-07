import { useEffect } from 'react';

import * as FirebaseService from '../services/firebaseService';

interface UseVerifierSessionsOptions {
    activeTab: string;
    setAvailableSessions: (sessions: any[]) => void;
}

async function fetchAllSessions(): Promise<any[]> {
    const allSessions: any[] = [];
    let cursor: string | null | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
        const result = await FirebaseService.getSessionsFromFirebase(
            undefined,
            cursor,
            200 // max page size supported by backend
        );
        allSessions.push(...result.sessions);
        cursor = result.nextCursor;
        hasMore = result.hasMore === true && !!cursor;
    }

    return allSessions;
}

export function useVerifierSessions({ activeTab, setAvailableSessions }: UseVerifierSessionsOptions) {
    useEffect(() => {
        if (activeTab === 'import' && FirebaseService.isFirebaseConfigured()) {
            fetchAllSessions()
                .then(sessions => setAvailableSessions(sessions))
                .catch(console.error);
        }
    }, [activeTab, setAvailableSessions]);
}

export default useVerifierSessions;
