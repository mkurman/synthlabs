import { ProviderType, ApiType, ResponsesSchemaName, ExternalProvider } from '../../../interfaces/enums';
import { SettingsService } from '../../settingsService';
import * as GeminiService from '../../geminiService';
import * as ExternalApiService from '../../externalApiService';
import * as PromptSchemaAdapter from '../../promptSchemaAdapter';
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK, PROVIDERS } from '../../../constants';
import { cleanResponse } from './responseParser';
import { isBackendAiAvailable, streamRewriteViaBackend, rewriteViaBackend } from '../../api/backendAiClient';

/**
 * Get the base URL for a provider:
 * - If customBaseUrl is set, use it
 * - For 'other' provider, use global customEndpointUrl from settings
 * - For known providers, use their URL from PROVIDERS constant
 */
function getBaseUrlForProvider(config: { customBaseUrl?: string; externalProvider: ExternalProvider | string }): string {
    // If explicitly set, use that
    if (config.customBaseUrl) return config.customBaseUrl;

    // For 'other' provider, use global customEndpointUrl
    if (config.externalProvider === ExternalProvider.Other || config.externalProvider === 'other') {
        return SettingsService.getCustomBaseUrl() || '';
    }

    // For known providers, use their default URL from PROVIDERS constant
    const providerConfig = PROVIDERS[config.externalProvider as ExternalProvider];
    return providerConfig?.url || '';
}

/**
 * Resolve provider string, base URL, and API key for backend routing.
 * Handles the Gemini vs External duality.
 */
function resolveBackendParams(config: RewriterConfig): {
    provider: string;
    baseUrl: string;
    apiKey: string;
} {
    if (config.provider === ProviderType.Gemini) {
        return {
            provider: 'gemini',
            baseUrl: config.customBaseUrl || PROVIDERS['gemini']?.url || '',
            apiKey: config.apiKey || SettingsService.getApiKey('gemini'),
        };
    }
    return {
        provider: config.externalProvider as string,
        baseUrl: getBaseUrlForProvider(config),
        apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
    };
}

export interface RewriterConfig {
    provider: ProviderType;
    externalProvider: ExternalProvider;
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
 * Build a system prompt from schema for rewrite calls
 */
function buildSchemaSystemPrompt(schema?: import('../../../types').PromptSchema): string {
    if (schema) {
        return schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
            type: 'object',
            properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
            required: schema.output.filter(f => !f.optional).map(f => f.name),
            additionalProperties: true
        });
    }
    return '\n\n' + JSON_OUTPUT_FALLBACK;
}

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
    const systemPrompt = buildSchemaSystemPrompt(schema);

    // Try backend routing first
    const useBackend = await isBackendAiAvailable();
    if (useBackend) {
        try {
            const { provider, baseUrl, apiKey } = resolveBackendParams(config);
            const result = await rewriteViaBackend({
                provider,
                model: config.model,
                apiKey,
                baseUrl,
                field: 'reasoning',
                originalContent: userPrompt,
                systemPrompt,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
                useRawPrompt: true,
                signal,
            });

            const cleaned = result.content;
            if (schema) {
                const validation = PromptSchemaAdapter.parseAndValidateResponse(cleaned, schema);
                if (!validation.isValid) {
                    console.warn('[VerifierRewriter] Missing required fields:', validation.missingFields);
                    return cleanResponse(cleaned) + '\n\n[ERROR: Missing required fields: ' + validation.missingFields.join(', ') + ']';
                }
                return cleanResponse(validation.data);
            }
            return cleanResponse(cleaned);
        } catch (backendError: any) {
            if (backendError?.name === 'AbortError' || signal?.aborted) throw backendError;
            console.warn('[aiCaller] Backend AI failed for callRewriterAI, falling back to direct call:', backendError);
        }
    }

    // Fallback: direct API calls
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
            customBaseUrl: getBaseUrlForProvider(config),
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
    const systemPrompt = buildSchemaSystemPrompt(schema);

    // Try backend routing first
    const useBackend = await isBackendAiAvailable();
    if (useBackend) {
        try {
            const { provider, baseUrl, apiKey } = resolveBackendParams(config);
            const result = await streamRewriteViaBackend({
                provider,
                model: config.model,
                apiKey,
                baseUrl,
                field: 'reasoning',
                originalContent: userPrompt,
                systemPrompt,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
                useRawPrompt: true,
                onChunk: (chunk, accumulated, _usage) => {
                    onChunk(chunk, accumulated);
                },
                signal,
            });
            return cleanResponse(result.content);
        } catch (backendError: any) {
            if (backendError?.name === 'AbortError' || signal?.aborted) throw backendError;
            console.warn('[aiCaller] Backend AI failed for callRewriterAIStreaming, falling back to direct call:', backendError);
        }
    }

    // Fallback: direct API calls
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
    } else {
        const result = await ExternalApiService.callExternalApi({
            provider: config.externalProvider,
            apiKey: config.apiKey || SettingsService.getApiKey(config.externalProvider),
            model: config.model,
            apiType: config.apiType || ApiType.Chat,
            customBaseUrl: getBaseUrlForProvider(config),
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

        return cleanResponse(result);
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
    signal?: AbortSignal,
    options?: { field?: 'query' | 'reasoning' | 'answer'; useRawPrompt?: boolean }
): Promise<string> {
    // Try backend AI streaming if available (both Gemini and External)
    const { provider, baseUrl, apiKey } = resolveBackendParams(config);
    const useBackend = await isBackendAiAvailable();

    if (useBackend) {
        try {
            const result = await streamRewriteViaBackend({
                provider,
                model: config.model,
                apiKey,
                baseUrl,
                field: options?.field || 'reasoning',
                originalContent: userPrompt,
                systemPrompt,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
                useRawPrompt: options?.useRawPrompt,
                onChunk: (chunk, accumulated, _usage) => {
                    onChunk(chunk, accumulated);
                },
                signal,
            });
            return cleanResponse(result.content);
        } catch (backendError: any) {
            if (backendError?.name === 'AbortError' || signal?.aborted) {
                throw backendError;
            }
            console.warn('[aiCaller] Backend AI failed, falling back to direct call:', backendError);
        }
    }

    // Fallback: direct API calls
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
        customBaseUrl: baseUrl,
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

    return cleanResponse(result);
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
    // Try backend routing first
    const useBackend = await isBackendAiAvailable();
    if (useBackend) {
        try {
            const { provider, baseUrl, apiKey } = resolveBackendParams(config);
            const result = await rewriteViaBackend({
                provider,
                model: config.model,
                apiKey,
                baseUrl,
                field: 'reasoning',
                originalContent: userPrompt,
                systemPrompt,
                generationParams: config.generationParams || SettingsService.getDefaultGenerationParams(),
                useRawPrompt: true,
                signal,
            });
            return result.content;
        } catch (backendError: any) {
            if (backendError?.name === 'AbortError' || signal?.aborted) throw backendError;
            console.warn('[aiCaller] Backend AI failed for callRewriterAIRaw, falling back to direct call:', backendError);
        }
    }

    // Fallback: direct API calls
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
            customBaseUrl: getBaseUrlForProvider(config),
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
