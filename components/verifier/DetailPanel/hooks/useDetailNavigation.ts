import { useCallback, useEffect } from 'react';
import type { VerifierItem } from '../../../../types';

interface UseDetailNavigationOptions {
    items: VerifierItem[];
    currentItem: VerifierItem | null;
    onNavigate: (item: VerifierItem) => void;
    isOpen: boolean;
    isEditing: boolean;
}

export function useDetailNavigation({
    items,
    currentItem,
    onNavigate,
    isOpen,
    isEditing
}: UseDetailNavigationOptions) {
    const currentIndex = currentItem ? items.findIndex(i => i.id === currentItem.id) : -1;
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

    const goToPrevious = useCallback(() => {
        if (hasPrevious && !isEditing) {
            onNavigate(items[currentIndex - 1]);
        }
    }, [hasPrevious, isEditing, currentIndex, items, onNavigate]);

    const goToNext = useCallback(() => {
        if (hasNext && !isEditing) {
            onNavigate(items[currentIndex + 1]);
        }
    }, [hasNext, isEditing, currentIndex, items, onNavigate]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't navigate while editing
            if (isEditing) return;
            
            // Only handle if not typing in an input/textarea
            if (document.activeElement?.tagName === 'INPUT' || 
                document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    goToPrevious();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    goToNext();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isEditing, goToPrevious, goToNext]);

    return {
        currentIndex,
        hasPrevious,
        hasNext,
        goToPrevious,
        goToNext,
        totalItems: items.length
    };
}

export default useDetailNavigation;
