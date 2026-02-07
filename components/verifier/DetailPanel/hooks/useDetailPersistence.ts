import { useCallback, useState } from 'react';
import type { VerifierItem } from '../../../../types';

interface UseDetailPersistenceOptions {
    item: VerifierItem | null;
    onDbUpdate?: (item: VerifierItem) => Promise<void>;
    onDbRollback?: (item: VerifierItem) => Promise<void>;
}

interface UseDetailPersistenceResult {
    isSaving: boolean;
    isRollingBack: boolean;
    itemState: 'idle' | 'saving' | 'saved' | 'rolling_back';
    handleSave: () => Promise<void>;
    handleRollback: () => Promise<void>;
}

export function useDetailPersistence({
    item,
    onDbUpdate,
    onDbRollback
}: UseDetailPersistenceOptions): UseDetailPersistenceResult {
    const [isSaving, setIsSaving] = useState(false);
    const [isRollingBack, setIsRollingBack] = useState(false);
    const [itemState, setItemState] = useState<'idle' | 'saving' | 'saved' | 'rolling_back'>('idle');

    const handleSave = useCallback(async () => {
        if (!item || !onDbUpdate) return;
        
        setIsSaving(true);
        setItemState('saving');
        try {
            await onDbUpdate(item);
            setItemState('saved');
            // Reset to idle after 2 seconds
            setTimeout(() => setItemState('idle'), 2000);
        } catch (error) {
            setItemState('idle');
        } finally {
            setIsSaving(false);
        }
    }, [item, onDbUpdate]);

    const handleRollback = useCallback(async () => {
        if (!item || !onDbRollback) return;
        
        setIsRollingBack(true);
        setItemState('rolling_back');
        try {
            await onDbRollback(item);
            setItemState('idle');
        } catch (error) {
            setItemState('idle');
        } finally {
            setIsRollingBack(false);
        }
    }, [item, onDbRollback]);

    return {
        isSaving,
        isRollingBack,
        itemState,
        handleSave,
        handleRollback
    };
}

export default useDetailPersistence;
