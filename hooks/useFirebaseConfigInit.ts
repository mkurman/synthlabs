import { useEffect } from 'react';

import * as FirebaseService from '../services/firebaseService';
import { logger } from '../utils/logger';

interface UseFirebaseConfigInitOptions {
    updateDbStats: () => void;
}

export function useFirebaseConfigInit({ updateDbStats }: UseFirebaseConfigInitOptions) {
    useEffect(() => {
        const savedConfig = localStorage.getItem('synth_firebase_config');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                FirebaseService.initializeFirebase(parsed).then(success => {
                    if (success) {
                        logger.log('Restored Firebase config from storage');
                        updateDbStats();
                    }
                });
            } catch {
                console.error('Failed to parse saved firebase config');
            }
        }
    }, [updateDbStats]);
}

export default useFirebaseConfigInit;
