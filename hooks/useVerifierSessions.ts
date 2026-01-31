import { useEffect } from 'react';

import * as FirebaseService from '../services/firebaseService';

interface UseVerifierSessionsOptions {
    activeTab: string;
    setAvailableSessions: (sessions: any[]) => void;
}

export function useVerifierSessions({ activeTab, setAvailableSessions }: UseVerifierSessionsOptions) {
    useEffect(() => {
        if (activeTab === 'import' && FirebaseService.isFirebaseConfigured()) {
            FirebaseService.getSessionsFromFirebase()
                .then(setAvailableSessions)
                .catch(console.error);
        }
    }, [activeTab, setAvailableSessions]);
}

export default useVerifierSessions;
