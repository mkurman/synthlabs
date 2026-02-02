import { AppView, ExternalProvider, ApiType } from '../../interfaces/enums';
import { GenerationParams } from '../../interfaces/config/GenerationParams';
import { callExternalApi } from '../externalApiService';

interface SessionNamingContext {
    dataset?: string;
    mode: AppView;
    itemCount?: number;
}

interface SessionNamingResult {
    header: string; // Main name
    subheader: string; // Date or secondary info
}

interface AIModelConfig {
    provider: ExternalProvider;
    model: string;
    apiKey: string;
    customBaseUrl?: string;
    generationParams?: GenerationParams;
}

/**
 * Generate a session name using AI or fallback to template-based naming
 * @param context - Information about the session
 * @param modelConfig - Optional AI model configuration (from settings default model)
 * @returns SessionNamingResult with header and subheader
 */
export async function generateSessionName(
    context: SessionNamingContext,
    modelConfig?: AIModelConfig
): Promise<SessionNamingResult> {
    // Try AI naming if model config is provided
    if (modelConfig) {
        try {
            const aiName = await generateAISessionName(context, modelConfig);
            if (aiName) {
                return aiName;
            }
        } catch (error) {
            console.warn('AI session naming failed, falling back to template:', error);
        }
    }

    // Fallback to template-based naming
    return generateTemplateSessionName(context);
}

/**
 * Generate session name using AI model
 */
async function generateAISessionName(
    context: SessionNamingContext,
    modelConfig: AIModelConfig
): Promise<SessionNamingResult | null> {
    const prompt = buildSessionNamingPrompt(context);

    try {
        const response = await callExternalApi({
            provider: modelConfig.provider,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey,
            apiType: ApiType.Chat,
            customBaseUrl: modelConfig.customBaseUrl || '',
            userPrompt: prompt,
            systemPrompt: 'You are a helpful assistant that generates concise, descriptive names for data generation sessions.',
            generationParams: modelConfig.generationParams,
            structuredOutput: false,
            stream: false
        });

        // Extract text from response
        const responseText = typeof response === 'string' ? response : response?.content || '';

        // Parse response to extract header and subheader
        const parsed = parseAISessionName(responseText);
        if (parsed) {
            return parsed;
        }
    } catch (error) {
        console.error('AI session naming request failed:', error);
    }

    return null;
}

/**
 * Build prompt for AI session naming
 */
function buildSessionNamingPrompt(context: SessionNamingContext): string {
    return `Generate a concise, descriptive name for a synthetic data generation session with the following details:
- Dataset: ${context.dataset || 'Custom'}
- Mode: ${context.mode === AppView.Creator ? 'Creator (generating new data)' : 'Verifier (reviewing/validating data)'}
${context.itemCount ? `- Items: ${context.itemCount}` : ''}

Requirements:
1. The name should be 2-5 words
2. It should clearly indicate the dataset and mode
3. Be professional and descriptive
4. Do not include date/time

Respond with ONLY the session name, nothing else.`;
}

/**
 * Parse AI response into header and subheader
 */
function parseAISessionName(response: string): SessionNamingResult | null {
    const trimmed = response.trim();

    // Basic validation
    if (!trimmed || trimmed.length > 100) {
        return null;
    }

    // Remove quotes if present
    const cleaned = trimmed.replace(/^["']|["']$/g, '');

    // Use AI generated name as header, date as subheader
    return {
        header: cleaned,
        subheader: formatDate(new Date())
    };
}

/**
 * Generate session name using template (fallback)
 */
function generateTemplateSessionName(context: SessionNamingContext): SessionNamingResult {
    const dataset = context.dataset || 'Custom Dataset';
    const mode = context.mode === AppView.Creator ? 'Creator' : 'Verifier';

    return {
        header: `${dataset} - ${mode}`,
        subheader: formatDate(new Date())
    };
}

/**
 * Format date for session subheader
 */
function formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    return date.toLocaleDateString('en-US', options);
}

/**
 * Auto-name session before first generation action
 * To be called right before the first generation starts
 */
export async function autoNameSessionBeforeGeneration(
    sessionId: string,
    context: SessionNamingContext,
    modelConfig?: AIModelConfig,
    onNameGenerated?: (sessionId: string, name: SessionNamingResult) => void
): Promise<SessionNamingResult> {
    const name = await generateSessionName(context, modelConfig);

    // Notify callback if provided
    if (onNameGenerated) {
        onNameGenerated(sessionId, name);
    }

    return name;
}
