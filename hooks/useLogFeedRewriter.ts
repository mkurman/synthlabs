import { useState, useCallback } from 'react';
import { LogFeedRewriteTarget } from '../interfaces/enums/LogFeedRewriteTarget';
import { RewriterConfig, callRewriterAIStreaming } from '../services/verifierRewriterService';
import { SettingsService } from '../services/settingsService';
import { ProviderType, ExternalProvider } from '../interfaces/enums';
import { SynthLogItem } from '../types';
import { extractJsonFields } from '../utils/jsonFieldExtractor';
import { toast } from '../services/toastService';

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
        itemId: string,
        field: LogFeedRewriteTarget,
        currentValue: string
    ) => {
        if (!rewriterConfig.model || rewriterConfig.model.trim() === '') {
            toast.error('Please configure a model in Feed Rewriter Settings');
            return;
        }

        setRewritingField({ itemId, field });
        setStreamingContent('');

        const fieldLabel = field === LogFeedRewriteTarget.Query ? 'query' :
            field === LogFeedRewriteTarget.Reasoning ? 'reasoning' : 'answer';

        try {
            const systemPrompts: Record<LogFeedRewriteTarget, string> = {
                [LogFeedRewriteTarget.Query]: `You are an expert at improving and clarifying user queries.
Given a user's question or request, rewrite it to be clearer, more specific, and better structured.
Preserve the original intent while improving clarity.
Return ONLY the improved query text in a JSON object.`,
                [LogFeedRewriteTarget.Reasoning]: `You are an expert at improving reasoning traces.
Given a reasoning trace, improve its clarity, logical flow, and depth of analysis.
Maintain the key insights while making the reasoning more thorough and structured.
Return ONLY the improved reasoning in a JSON object.`,
                [LogFeedRewriteTarget.Answer]: `You are an expert at improving answers.
Given an answer, improve its clarity, accuracy, and completeness.
Maintain the core message while making the answer more comprehensive and well-structured.
Return ONLY the improved answer in a JSON object.`
            };

            const userPrompt = `Improve and rewrite this ${fieldLabel}:

${currentValue}

IMPORTANT: Respond with a VALID JSON object containing the improved text.

Expected Output Format:
{
  "response": "The improved version..."
}`;

            const result = await callRewriterAIStreaming(
                userPrompt,
                {
                    ...rewriterConfig,
                    systemPrompt: systemPrompts[field]
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
            onUpdateLog(itemId, {
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
