import { useState, useCallback } from 'react';
import { LogFeedRewriteTarget } from '../interfaces/enums/LogFeedRewriteTarget';
import { RewriterConfig, callRewriterAIStreaming } from '../services/verifierRewriterService';
import { SettingsService } from '../services/settingsService';
import { PromptService } from '../services/promptService';
import { ProviderType, ExternalProvider, PromptCategory, PromptRole } from '../interfaces/enums';
import { SynthLogItem } from '../types';
import { extractJsonFields } from '../utils/jsonFieldExtractor';
import { toast } from '../services/toastService';

/**
 * Build context prompt that includes all item fields, not just the target field.
 */
function buildRewriteContext(item: SynthLogItem, field: LogFeedRewriteTarget): string {
    const query = item.query || '';
    const reasoning = (item as any).reasoning_content || item.reasoning || '';
    const answer = item.answer || '';

    const fieldLabel = field === LogFeedRewriteTarget.Query ? 'query' :
        field === LogFeedRewriteTarget.Reasoning ? 'reasoning' : 'answer';

    const targetValue = field === LogFeedRewriteTarget.Query ? query :
        field === LogFeedRewriteTarget.Reasoning ? reasoning : answer;

    return `## FULL ITEM CONTEXT

**Query:** ${query}

**Reasoning Trace:**
${reasoning}

**Answer:**
${answer}

---
TARGET FIELD TO REWRITE: ${fieldLabel.toUpperCase()}
Current value of ${fieldLabel}:
${targetValue}

IMPORTANT: Respond with a VALID JSON object containing the improved text.

Expected Output Format:
{
  "response": "The improved version..."
}`;
}

interface UseLogFeedRewriterOptions {
    onUpdateLog: (id: string, updates: Partial<SynthLogItem>) => void;
}

export function useLogFeedRewriter({ onUpdateLog }: UseLogFeedRewriterOptions) {
    // Editing state
    const [editingField, setEditingField] = useState<{
        itemId: string;
        field: LogFeedRewriteTarget;
        originalValue: string;
    } | null>(null);
    const [editValue, setEditValue] = useState('');

    // Rewriting state
    const [rewritingField, setRewritingField] = useState<{
        itemId: string;
        field: LogFeedRewriteTarget;
    } | null>(null);
    const [streamingContent, setStreamingContent] = useState('');

    // Rewriter config
    const [rewriterConfig, setRewriterConfig] = useState<RewriterConfig>(() => {
        const settings = SettingsService.getSettings();
        const externalProvider = settings.defaultProvider || ExternalProvider.OpenRouter;
        return {
            provider: ProviderType.External,
            externalProvider: externalProvider as ExternalProvider,
            apiKey: '',
            model: SettingsService.getDefaultModel(externalProvider) || '',
            customBaseUrl: '',
            maxRetries: 3,
            retryDelay: 2000,
            generationParams: SettingsService.getDefaultGenerationParams()
        };
    });

    // Start editing
    const startEditing = useCallback((
        itemId: string,
        field: LogFeedRewriteTarget,
        currentValue: string
    ) => {
        setEditingField({ itemId, field, originalValue: currentValue });
        setEditValue(currentValue);
    }, []);

    // Cancel editing
    const cancelEditing = useCallback(() => {
        setEditingField(null);
        setEditValue('');
    }, []);

    // Save editing
    const saveEditing = useCallback(() => {
        if (!editingField) return;

        onUpdateLog(editingField.itemId, {
            [editingField.field]: editValue
        });

        setEditingField(null);
        setEditValue('');
        toast.success('Changes saved');
    }, [editingField, editValue, onUpdateLog]);

    // Handle rewrite
    const handleRewrite = useCallback(async (
        item: SynthLogItem,
        field: LogFeedRewriteTarget
    ) => {
        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please configure a model in Feed Rewriter Settings');
            return;
        }

        setRewritingField({ itemId: item.id, field });
        setStreamingContent('');

        const fieldLabel = field === LogFeedRewriteTarget.Query ? 'query' :
            field === LogFeedRewriteTarget.Reasoning ? 'reasoning' : 'answer';

        try {
            // Load rewriter prompt schema from the active prompt set
            const promptSet = SettingsService.getSettings().promptSet || 'default';
            const promptSchema = PromptService.getPromptSchema(PromptCategory.Verifier, PromptRole.Rewriter, promptSet);

            const userPrompt = buildRewriteContext(item, field);

            const result = await callRewriterAIStreaming(
                userPrompt,
                {
                    ...rewriterConfig,
                    promptSchema
                },
                (_chunk: string, accumulated: string) => {
                    const extracted = extractJsonFields(accumulated);
                    if (extracted.answer) {
                        setStreamingContent(extracted.answer);
                    } else {
                        setStreamingContent(accumulated);
                    }
                }
            );

            // Extract final value
            const extracted = extractJsonFields(result);
            const finalValue = extracted.answer || result.trim();

            // Update the log
            onUpdateLog(item.id, {
                [field]: finalValue
            });

            toast.success(`${fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1)} rewritten`);
        } catch (error) {
            console.error('Rewrite failed:', error);
            toast.error('Rewrite failed. See console for details.');
        } finally {
            setRewritingField(null);
            setStreamingContent('');
        }
    }, [rewriterConfig, onUpdateLog]);

    return {
        // Editing state
        editingField,
        editValue,
        setEditValue,
        startEditing,
        cancelEditing,
        saveEditing,
        // Rewriting state
        rewritingField,
        streamingContent,
        handleRewrite,
        // Config
        rewriterConfig,
        setRewriterConfig
    };
}

export default useLogFeedRewriter;
