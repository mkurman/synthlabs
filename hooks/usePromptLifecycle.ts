import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { PromptService } from '../services/promptService';
import { SettingsService } from '../services/settingsService';
import { PromptCategory, PromptRole, OutputFieldName } from '../interfaces/enums';
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
    const getDefaultSelectedFields = (schema?: { output?: { name: OutputFieldName; optional?: boolean }[] }, existing?: OutputFieldName[]) => {
        if (existing && existing.length > 0) {
            return existing;
        }
        return schema?.output?.filter(field => !field.optional).map(field => field.name) || [];
    };
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
                meta: {
                    ...prev.phases.meta,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta, activeSet),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Meta, activeSet),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Meta, activeSet),
                        prev.phases.meta.selectedFields
                    )
                },
                retrieval: {
                    ...prev.phases.retrieval,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval, activeSet),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Retrieval, activeSet),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Retrieval, activeSet),
                        prev.phases.retrieval.selectedFields
                    )
                },
                derivation: {
                    ...prev.phases.derivation,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation, activeSet),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Derivation, activeSet),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Derivation, activeSet),
                        prev.phases.derivation.selectedFields
                    )
                },
                writer: {
                    ...prev.phases.writer,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer, activeSet),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Writer, activeSet),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Writer, activeSet),
                        prev.phases.writer.selectedFields
                    )
                },
                rewriter: {
                    ...prev.phases.rewriter,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter, activeSet),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Rewriter, activeSet),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Rewriter, activeSet),
                        prev.phases.rewriter.selectedFields
                    )
                }
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
                meta: {
                    ...prev.phases.meta,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Meta),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Meta),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Meta),
                        prev.phases.meta.selectedFields
                    )
                },
                retrieval: {
                    ...prev.phases.retrieval,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Retrieval),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Retrieval),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Retrieval),
                        prev.phases.retrieval.selectedFields
                    )
                },
                derivation: {
                    ...prev.phases.derivation,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Generator, PromptRole.Derivation),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Derivation),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Generator, PromptRole.Derivation),
                        prev.phases.derivation.selectedFields
                    )
                },
                writer: {
                    ...prev.phases.writer,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Writer),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Writer),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Writer),
                        prev.phases.writer.selectedFields
                    )
                },
                rewriter: {
                    ...prev.phases.rewriter,
                    systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter),
                    promptSchema: PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Rewriter),
                    selectedFields: getDefaultSelectedFields(
                        PromptService.getPromptSchema(PromptCategory.Converter, PromptRole.Rewriter),
                        prev.phases.rewriter.selectedFields
                    )
                }
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
