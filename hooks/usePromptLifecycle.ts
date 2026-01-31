import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { PromptService } from '../services/promptService';
import { SettingsService } from '../services/settingsService';
import { PromptCategory, PromptRole } from '../interfaces/enums';
import type { DeepConfig, UserAgentConfig } from '../types';

interface UsePromptLifecycleOptions {
    sessionPromptSet: string | null;
    setAvailablePromptSets: (sets: string[]) => void;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setDeepConfig: Dispatch<SetStateAction<DeepConfig>>;
    setUserAgentConfig: Dispatch<SetStateAction<UserAgentConfig>>;
}

export function usePromptLifecycle({
    sessionPromptSet,
    setAvailablePromptSets,
    setSystemPrompt,
    setConverterPrompt,
    setDeepConfig,
    setUserAgentConfig
}: UsePromptLifecycleOptions) {
    useEffect(() => {
        const sets = PromptService.getAvailableSets();
        setAvailablePromptSets(sets);
    }, [setAvailablePromptSets]);

    useEffect(() => {
        const activeSet = sessionPromptSet || SettingsService.getSettings().promptSet || 'default';

        setSystemPrompt(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System, activeSet));
        setConverterPrompt(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System, activeSet));

        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta, activeSet) },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval, activeSet) },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation, activeSet) },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer, activeSet) },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter, activeSet) }
            }
        }));

        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.UserAgent, activeSet)
        }));
    }, [sessionPromptSet, setConverterPrompt, setDeepConfig, setSystemPrompt, setUserAgentConfig]);

    const refreshPrompts = useCallback(() => {
        setSystemPrompt(PromptService.getPrompt(PromptCategory.Generator, PromptRole.System));
        setConverterPrompt(PromptService.getPrompt(PromptCategory.Converter, PromptRole.System));

        setDeepConfig((prev: DeepConfig) => ({
            ...prev,
            phases: {
                meta: { ...prev.phases.meta, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta) },
                retrieval: { ...prev.phases.retrieval, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval) },
                derivation: { ...prev.phases.derivation, systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation) },
                writer: { ...prev.phases.writer, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer) },
                rewriter: { ...prev.phases.rewriter, systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter) }
            }
        }));

        setUserAgentConfig((prev: UserAgentConfig) => ({
            ...prev,
            systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.UserAgent)
        }));
    }, [setConverterPrompt, setDeepConfig, setSystemPrompt, setUserAgentConfig]);

    return { refreshPrompts };
}

export default usePromptLifecycle;
