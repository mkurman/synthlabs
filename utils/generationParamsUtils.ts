import { GenerationParams } from '../types';

/**
 * Checks if a generation param value is valid (not null, undefined, or empty string)
 */
export function isValidParamValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
}

/**
 * Cleans generation params by removing null, undefined, and empty string values
 * Returns a new object with only valid params in API format (snake_case)
 */
export function cleanGenerationParamsForApi(params: GenerationParams | undefined): Record<string, any> {
    const cleaned: Record<string, any> = {};
    if (!params) return cleaned;

    if (isValidParamValue(params.temperature)) cleaned.temperature = params.temperature;
    if (isValidParamValue(params.topP)) cleaned.top_p = params.topP;
    if (isValidParamValue(params.topK)) cleaned.top_k = params.topK;
    if (isValidParamValue(params.frequencyPenalty)) cleaned.frequency_penalty = params.frequencyPenalty;
    if (isValidParamValue(params.presencePenalty)) cleaned.presence_penalty = params.presencePenalty;

    return cleaned;
}

/**
 * Cleans generation params for Gemini API (camelCase format)
 * Returns a new object with only valid params
 */
export function cleanGenerationParamsForGemini(params: GenerationParams | undefined): Record<string, any> {
    const cleaned: Record<string, any> = {};
    if (!params) return cleaned;

    if (isValidParamValue(params.temperature)) cleaned.temperature = params.temperature;
    if (isValidParamValue(params.topP)) cleaned.topP = params.topP;
    if (isValidParamValue(params.topK)) cleaned.topK = params.topK;
    if (isValidParamValue(params.frequencyPenalty)) cleaned.frequencyPenalty = params.frequencyPenalty;
    if (isValidParamValue(params.presencePenalty)) cleaned.presencePenalty = params.presencePenalty;

    return cleaned;
}
