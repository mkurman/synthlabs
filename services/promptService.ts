
import { SettingsService } from './settingsService';

// Use import.meta.glob to load all prompt text files
const promptFiles = import.meta.glob('/prompts/**/*.txt', { query: '?raw', import: 'default', eager: true });

type PromptCategory = 'generator' | 'converter' | 'verifier';

export const PromptService = {
    /**
     * Retrieves a prompt template by role and category.
     * Tries to find it in the configured prompt set, falls back to 'default'.
     */
    getPrompt(category: PromptCategory, role: string, forceSetId?: string): string {
        const setId = forceSetId || SettingsService.getSettings().promptSet || 'default';

        // Construct paths
        const specificPath = `/prompts/${setId}/${category}/${role}.txt`;
        const defaultPath = `/prompts/default/${category}/${role}.txt`;

        // Try exact match
        if (promptFiles[specificPath]) {
            return promptFiles[specificPath] as string;
        }

        // Fallback to default if we are not already asking for default
        if (setId !== 'default' && promptFiles[defaultPath]) {
            // Optional: Log fallback warning? 
            // console.warn(`Prompt not found: ${specificPath}, falling back to default.`);
            return promptFiles[defaultPath] as string;
        }

        // Last resort: verify if default exists, otherwise error or empty string
        if (promptFiles[defaultPath]) {
            return promptFiles[defaultPath] as string;
        }

        console.error(`Prompt completely missing: ${category}/${role} (Set: ${setId})`);
        return '';
    },

    /**
     * Discovers all available prompt sets by scanning the directories.
     */
    getAvailableSets(): string[] {
        const sets = new Set<string>();

        Object.keys(promptFiles).forEach(path => {
            // Path format: /prompts/<setId>/<category>/<role>.txt
            const parts = path.split('/');
            // ["", "prompts", "setId", "category", "file"]
            if (parts.length >= 3 && parts[1] === 'prompts') {
                sets.add(parts[2]);
            }
        });

        return Array.from(sets).sort();
    }
};
