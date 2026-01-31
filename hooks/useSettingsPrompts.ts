import { useEffect } from 'react';
import { PromptService } from '../services/promptService';

export interface UseSettingsPromptsReturn {
    loadPromptSets: () => void;
}

export function useSettingsPrompts(
    isOpen: boolean,
    setAvailablePromptSets: React.Dispatch<React.SetStateAction<string[]>>,
    setPromptMetadata: React.Dispatch<React.SetStateAction<Record<string, { name?: string; description?: string; symbols?: string[]; features?: string[] }>>>
): UseSettingsPromptsReturn {
    const loadPromptSets = () => {
        setAvailablePromptSets(PromptService.getAvailableSets());
        setPromptMetadata(PromptService.getAllMetadata());
    };

    useEffect(() => {
        if (isOpen) {
            loadPromptSets();
        }
    }, [isOpen]);

    return { loadPromptSets };
}
