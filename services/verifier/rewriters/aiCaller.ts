import { ProviderType, ApiType, ResponsesSchemaName } from '../../../interfaces/enums';
import { SettingsService } from '../../settingsService';
import * as GeminiService from '../../geminiService';
import * as ExternalApiService from '../../externalApiService';
import * as PromptSchemaAdapter from '../../promptSchemaAdapter';
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK } from '../../../constants';
import { cleanResponse } from './responseParser';

export interface RewriterConfig {
    provider: ProviderType;
    externalProvider: import('../../../types').ExternalProvider;
    apiType?: ApiType;
    apiKey: string;
    model: string;
    customBaseUrl?: string;
    maxRetries?: number;
    retryDelay?: number;
    promptSchema?: import('../../../types').PromptSchema;
    systemPrompt?: string;
    generationParams?: import('../../../types').GenerationParams;
    stream?: boolean;
    concurrency?: number;
    delayMs?: number;
}

export type RewriterStreamCallback = (chunk: string, accumulated: string) => void;

/**
 * Calls the AI service to rewrite content
 * Returns the cleaned response text
 */
export async function callRewriterAI(
    userPrompt: string,
    config: RewriterConfig,
    signal?: AbortSignal
): Promise<string> {
    const schema = config.promptSchema;

    if (config.provider === ProviderType.Gemini) {
        let geminiSystemPrompt = '\n\n' + JSON_OUTPUT_FALLBACK;
        if (schema) {
            geminiSystemPrompt = schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
                type: 'object',
                properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
                required: schema.output.filter(f => !f.optional).map(f => f.name),
                additionalProperties: true
            });
        }
        
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            geminiSystemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        const rawText = result.answer || result.reasoning || String(result);
        return cleanResponse(rawText);
    } else {
        const isRewriteField = schema?.output.some(f => f.name === 'response');
        const responsesSchema: ExternalApiService.ResponsesSchemaName = isRewriteField
            ? ResponsesSchemaName.RewriteResponse
            : ResponsesSchemaName.ReasoningTrace;

        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || ApiType.Chat,
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            promptSchema: schema,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: true,
            responsesSchema,
        });

        if (schema) {
            const validation = PromptSchemaAdapter.parseAndValidateResponse(result, schema);
            if (!validation.isValid) {
                console.warn(`[VerifierRewriter] Missing required fields:`, validation.missingFields);
                return cleanResponse(result) + '\n\n[ERROR: Missing required fields: ' + validation.missingFields.join(', ') + ']';
            }
            return cleanResponse(validation.data);
        }

        return cleanResponse(result);
    }
}

/**
 * Calls the AI service to rewrite content with streaming support
 */
export async function callRewriterAIStreaming(
    userPrompt: string,
    config: RewriterConfig,
    onChunk: RewriterStreamCallback,
    signal?: AbortSignal
): Promise<string> {
    const schema = config.promptSchema;

    if (config.provider === ProviderType.Gemini) {
        let geminiSystemPrompt = '\n\n' + JSON_OUTPUT_FALLBACK;
        if (schema) {
            geminiSystemPrompt = schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
                type: 'object',
                properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
                required: schema.output.filter(f => !f.optional).map(f => f.name),
                additionalProperties: true
            });
        }

        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            geminiSystemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        const rawText = result.answer || result.reasoning || String(result);
        const cleaned = cleanResponse(rawText);
        onChunk(cleaned, cleaned);
        return cleaned;
    } else {
        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || ApiType.Chat,
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            promptSchema: schema,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: false,
            stream: true,
            onStreamChunk: (chunk, accumulated) => onChunk(chunk, accumulated)
        });

        return typeof result === 'string' ? result : cleanResponse(result);
    }
}

/**
 * Calls the AI service to rewrite content with a custom system prompt
 */
export async function callRewriterAIStreamingWithSystemPrompt(
    systemPrompt: string,
    userPrompt: string,
    config: RewriterConfig,
    onChunk: RewriterStreamCallback,
    signal?: AbortSignal
): Promise<string> {
    if (config.provider === ProviderType.Gemini) {
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            systemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        const rawText = result.answer || result.reasoning || String(result);
        const cleaned = cleanResponse(rawText);
        onChunk(cleaned, cleaned);
        return cleaned;
    }

    const result = await ExternalApiService.callExternalApi({
        provider: config.externalProvider,
        apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
        model: config.model,
        apiType: config.apiType || ApiType.Chat,
        customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
        systemPrompt,
        userPrompt,
        signal,
        maxRetries: config.maxRetries ?? 2,
        retryDelay: config.retryDelay ?? 1000,
        generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
        structuredOutput: false,
        stream: true,
        onStreamChunk: (chunk, accumulated) => onChunk(chunk, accumulated)
    });

    return typeof result === 'string' ? result : cleanResponse(result);
}

/**
 * Calls the AI service and returns raw result for structured parsing
 */
export async function callRewriterAIRaw(
    systemPrompt: string,
    userPrompt: string,
    config: RewriterConfig,
    signal?: AbortSignal
): Promise<any> {
    if (config.provider === ProviderType.Gemini) {
        const result = await GeminiService.generateReasoningTrace(
            userPrompt,
            systemPrompt,
            {
                maxRetries: config.maxRetries ?? 2,
                retryDelay: config.retryDelay ?? 1000,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams()
            }
        );
        return result.answer || result.reasoning || String(result);
    } else {
        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || ApiType.Chat,
            customBaseUrl: config.customBaseUrl || SettingsService.getCustomBaseUrl(),
            systemPrompt,
            userPrompt,
            signal,
            maxRetries: config.maxRetries ?? 2,
            retryDelay: config.retryDelay ?? 1000,
            generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
            structuredOutput: true,
            responsesSchema: ResponsesSchemaName.ReasoningTrace
        });

        return result;
    }
}
