import { ChatRole } from '../interfaces/enums';
import type { VerifierItem } from '../types';

const ensureString = (val: any) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
};

export const normalizeImportItem = (raw: any): VerifierItem => {
    let query = raw.query || raw.instruction || raw.question || raw.prompt || raw.input || '';
    if (!query && Array.isArray(raw.messages)) {
        const lastUser = raw.messages.findLast((m: any) => m.role === ChatRole.User);
        if (lastUser) query = lastUser.content;
    }

    let answer = raw.answer || raw.output || raw.response || raw.completion || '';
    if (Array.isArray(raw.messages)) {
        const lastAssistant = raw.messages.findLast((m: any) => m.role === ChatRole.Assistant);
        if (lastAssistant) answer = lastAssistant.content;
    }

    const reasoning = raw.reasoning || raw.reasoning_trace || raw.thought || raw.thoughts || raw.scratchpad || raw.rationale || raw.trace || '';

    let modelUsed = raw.modelUsed || raw.model || raw.generator || 'Imported';
    if (modelUsed === 'Imported' && raw.deepMetadata && raw.deepMetadata.writer) {
        modelUsed = `DEEP: ${raw.deepMetadata.writer}`;
    }

    if (typeof modelUsed !== 'string') {
        modelUsed = String(modelUsed);
    }

    return {
        ...raw,
        id: raw.id || crypto.randomUUID(),
        query: ensureString(query),
        answer: ensureString(answer),
        reasoning: ensureString(reasoning),
        messages: Array.isArray(raw.messages) ? raw.messages : undefined,
        isMultiTurn: Array.isArray(raw.messages) && raw.messages.length > 0,
        seed_preview: raw.seed_preview || ensureString(query).substring(0, 100),
        full_seed: raw.full_seed || ensureString(query),
        timestamp: raw.timestamp || new Date().toISOString(),
        modelUsed,
        score: raw.score || 0,
        isDuplicate: false,
        isDiscarded: false,
        hasUnsavedChanges: false
    } as VerifierItem;
};

export default { normalizeImportItem };
