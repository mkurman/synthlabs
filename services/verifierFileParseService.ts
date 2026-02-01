import type { VerifierItem } from '../types';
import { normalizeImportItem } from './verifierImportService';

export const parseVerifierItemsFromText = (text: string): VerifierItem[] => {
    const content = text.trim();
    if (!content) return [];

    if (content.startsWith('[') && content.endsWith(']')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeImportItem);
        }
        return [];
    }

    const lines = content.split('\n');
    return lines
        .filter(line => line.trim().length > 0)
        .map(line => {
            try {
                return normalizeImportItem(JSON.parse(line));
            } catch {
                return null;
            }
        })
        .filter((item): item is VerifierItem => item !== null);
};

export default { parseVerifierItemsFromText };
