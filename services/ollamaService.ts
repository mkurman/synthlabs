import { OllamaStatus } from '../types';
import { OllamaModel } from './externalApiService';
import { 
    fetchOllamaModels as fetchOllamaModelsApi, 
    checkOllamaStatus as checkOllamaStatusApi,
    formatOllamaModelSize as formatOllamaModelSizeUtil
} from './externalApiService';
import { logger } from '../utils/logger';

export interface OllamaServiceResult {
    models: OllamaModel[];
    status: OllamaStatus;
    selectedModel?: string;
}

/**
 * Check Ollama server status and fetch available models
 * @param baseUrl - Ollama server URL (default: http://localhost:11434)
 * @returns Object containing models list and connection status
 */
export async function refreshOllamaModels(
    baseUrl: string = 'http://localhost:11434'
): Promise<OllamaServiceResult> {
    logger.log('[OllamaService] Refreshing Ollama models...');
    
    try {
        const isOnline = await checkOllamaStatusApi(baseUrl);
        
        if (isOnline) {
            const models = await fetchOllamaModelsApi(baseUrl);
            logger.log(`[OllamaService] Found ${models.length} models`);
            return {
                models,
                status: OllamaStatus.Online
            };
        } else {
            logger.warn('[OllamaService] Ollama is offline');
            return {
                models: [],
                status: OllamaStatus.Offline
            };
        }
    } catch (error) {
        logger.error('[OllamaService] Error refreshing models:', error);
        return {
            models: [],
            status: OllamaStatus.Offline
        };
    }
}

/**
 * Check if Ollama server is running
 * @param baseUrl - Ollama server URL
 * @returns true if Ollama is online
 */
export async function checkOllamaStatus(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
    return checkOllamaStatusApi(baseUrl);
}

/**
 * Fetch available models from Ollama
 * @param baseUrl - Ollama server URL
 * @returns Array of available models
 */
export async function fetchOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<OllamaModel[]> {
    return fetchOllamaModelsApi(baseUrl);
}

/**
 * Format model size for display
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "7GB", "500MB")
 */
export function formatOllamaModelSize(bytes: number): string {
    return formatOllamaModelSizeUtil(bytes);
}

/**
 * Get the first available model name
 * @param models - Array of Ollama models
 * @returns First model name or undefined
 */
export function getFirstModelName(models: OllamaModel[]): string | undefined {
    return models.length > 0 ? models[0].name : undefined;
}

/**
 * Check if a model name is valid for Ollama
 * @param modelName - Model name to check
 * @returns true if it looks like an Ollama model (no slashes)
 */
export function isValidOllamaModel(modelName: string | null | undefined): boolean {
    if (!modelName) return false;
    // Ollama models typically don't contain slashes, unlike OpenRouter models
    return !modelName.includes('/');
}
