import { ChatRole, OutputFieldName } from '../interfaces/enums';
import type { ChatMessage, HuggingFaceConfig, VerifierItem } from '../types';
import { normalizeImportItem } from './verifierImportService';

const COLUMN_SEPARATOR = '\n\n' + '-'.repeat(50) + '\n\n';

interface VerifierHfRowMappingConfig {
    hfConfig: HuggingFaceConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(normalizeToString).filter(Boolean).join('\n');
    if (isRecord(value)) {
        const content = value.content ?? value.text ?? value.value ?? value.message;
        if (content !== undefined) return normalizeToString(content);
        return JSON.stringify(value);
    }
    return String(value);
}

function isChatMessageLike(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    return 'role' in value || 'from' in value || 'content' in value || 'text' in value;
}

function toChatRole(value: unknown): ChatRole | null {
    if (typeof value !== 'string') return null;
    const role = value.toLowerCase();
    if (role === ChatRole.User) return ChatRole.User;
    if (role === ChatRole.Assistant) return ChatRole.Assistant;
    if (role === ChatRole.System) return ChatRole.System;
    if (role === ChatRole.Tool) return ChatRole.Tool;
    if (role === ChatRole.Model) return ChatRole.Model;
    return null;
}

function toChatMessage(value: Record<string, unknown>): ChatMessage | null {
    const roleValue = value.role ?? value.from;
    const role = toChatRole(roleValue);
    if (!role) return null;
    const content = normalizeToString(value.content ?? value.text ?? value.value ?? value.message);
    if (!content) return null;
    const reasoning = normalizeToString(value.reasoning ?? value.reasoning_content);
    return reasoning
        ? { role, content, reasoning }
        : { role, content };
}

function extractMessages(row: Record<string, unknown>): ChatMessage[] | undefined {
    const rawMessages = row.messages;
    if (!Array.isArray(rawMessages)) return undefined;
    const parsed = rawMessages
        .filter(isChatMessageLike)
        .map((msg) => toChatMessage(msg))
        .filter((msg): msg is ChatMessage => Boolean(msg));
    return parsed.length > 0 ? parsed : undefined;
}

function formatMcqOptions(options: unknown): string {
    if (!options) return '';
    if (isRecord(options)) {
        return Object.entries(options)
            .map(([key, value]) => `${key}: ${normalizeToString(value)}`)
            .join('\n');
    }
    if (Array.isArray(options)) {
        const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return options
            .map((opt, idx) => `${labels[idx] || idx + 1}: ${normalizeToString(opt)}`)
            .join('\n');
    }
    return normalizeToString(options);
}

function extractArrayValue(values: unknown[], hfConfig: HuggingFaceConfig): string {
    if (values.length === 0) return '';
    const turnIndex = hfConfig.messageTurnIndex ?? 0;
    const chatMessages = values.filter(isChatMessageLike);
    if (chatMessages.length > 0) {
        const messageIndex = Math.min(turnIndex * 2, chatMessages.length - 1);
        return normalizeToString(chatMessages[messageIndex]);
    }
    const index = Math.min(turnIndex, values.length - 1);
    return normalizeToString(values[index]);
}

function extractColumnValue(
    row: Record<string, unknown>,
    columnName: string,
    config: VerifierHfRowMappingConfig
): string {
    const value = row[columnName];
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return extractArrayValue(value, config.hfConfig);
    return normalizeToString(value);
}

function buildCombinedValue(
    row: Record<string, unknown>,
    columns: string[] | undefined,
    config: VerifierHfRowMappingConfig
): string {
    if (!columns || columns.length === 0) return '';
    const contents = columns
        .map((col) => extractColumnValue(row, col, config))
        .map((value) => value.trim())
        .filter(Boolean);
    return contents.join(COLUMN_SEPARATOR);
}

function buildQueryValue(
    row: Record<string, unknown>,
    config: VerifierHfRowMappingConfig
): string {
    const query = buildCombinedValue(row, config.hfConfig.inputColumns, config);
    if (!query) return '';
    if (!config.hfConfig.mcqColumn) return query;
    const optionsValue = row[config.hfConfig.mcqColumn];
    const formatted = formatMcqOptions(optionsValue);
    if (!formatted) return query;
    return `${query}\n\nOptions:\n${formatted}`;
}

function getFallbackReasoning(row: Record<string, unknown>): string {
    const explicit = row[OutputFieldName.ReasoningContent] ?? row[OutputFieldName.Reasoning];
    return normalizeToString(explicit);
}

function buildVerifierItem(
    row: Record<string, unknown>,
    config: VerifierHfRowMappingConfig
): VerifierItem {
    const query = buildQueryValue(row, config);
    const answer = buildCombinedValue(row, config.hfConfig.outputColumns, config);
    const reasoning = buildCombinedValue(row, config.hfConfig.reasoningColumns, config) || getFallbackReasoning(row);
    const messages = extractMessages(row);

    const raw: Record<string, unknown> = { ...row };
    if (query) raw.query = query;
    if (answer) raw.answer = answer;
    if (reasoning) raw.reasoning = reasoning;
    if (messages) raw.messages = messages;

    return normalizeImportItem(raw);
}

export function mapHfRowsToVerifierItems(
    rows: Record<string, unknown>[],
    config: VerifierHfRowMappingConfig
): VerifierItem[] {
    return rows.map((row) => buildVerifierItem(row, config));
}

export default { mapHfRowsToVerifierItems };
