import React from 'react';
import { Layers, RefreshCw, Settings, Upload, Save, Wand2 } from 'lucide-react';
import { CreatorMode, DataSource } from '../../interfaces/enums';
import { HuggingFaceConfig, GenerationParams } from '../../types';
import { OutputField } from '../../interfaces/types/PromptSchema';
import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';
import GenerationParamsInput from '../GenerationParamsInput';
import FieldSelectionPanel from './FieldSelectionPanel';

interface GenerationPromptPanelProps {
    generationParams: GenerationParams;
    onGenerationParamsChange: (params: GenerationParams) => void;
    appMode: CreatorMode;
    systemPrompt: string;
    converterPrompt: string;
    onSystemPromptChange: (value: string) => void;
    onConverterPromptChange: (value: string) => void;
    onLoadRubric: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveRubric: () => void;
    onOptimizePrompt: () => void;
    isOptimizing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    dataSourceMode: DataSource;
    hfConfig: HuggingFaceConfig;
    onHfConfigChange: (config: HuggingFaceConfig) => void;
    // Field selection props
    outputFields?: OutputField[];
    onFieldToggle?: (fieldName: OutputFieldName) => void;
    onResetFieldSelection?: () => void;
    onSelectAllFields?: () => void;
    onDeselectAllFields?: () => void;
    useNativeOutput?: boolean;
    onToggleNativeOutput?: (value: boolean) => void;
}

export default function GenerationPromptPanel({
    generationParams,
    onGenerationParamsChange,
    appMode,
    systemPrompt,
    converterPrompt,
    onSystemPromptChange,
    onConverterPromptChange,
    onLoadRubric,
    onSaveRubric,
    onOptimizePrompt,
    isOptimizing,
    fileInputRef,
    dataSourceMode,
    hfConfig,
    onHfConfigChange,
    // Field selection props
    outputFields = [],
    onFieldToggle,
    onResetFieldSelection,
    onSelectAllFields,
    onDeselectAllFields,
    useNativeOutput = false,
    onToggleNativeOutput
}: GenerationPromptPanelProps) {
    return (
        <>
            <div className="pt-2 border-t border-slate-800/50">
                <GenerationParamsInput
                    params={generationParams}
                    onChange={onGenerationParamsChange}
                    label="Generation Parameters"
                />
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                        <Settings className="w-3 h-3" /> System Prompt
                    </label>
                    <div className="flex items-center gap-1">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                            <Upload className="w-2.5 h-2.5" /> Load
                        </button>
                        <input type="file" ref={fileInputRef} onChange={onLoadRubric} className="hidden" accept=".txt,.md,.json" />
                        <button onClick={onSaveRubric} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-[9px] px-1.5 py-1 rounded transition-colors">
                            <Save className="w-2.5 h-2.5" /> Save
                        </button>
                        <button onClick={onOptimizePrompt} disabled={isOptimizing} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[9px] px-1.5 py-1 rounded flex items-center gap-1 transition-all">
                            {isOptimizing ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />} Optimize
                        </button>
                    </div>
                </div>
                <textarea
                    value={appMode === CreatorMode.Generator ? systemPrompt : converterPrompt}
                    onChange={e => appMode === CreatorMode.Generator ? onSystemPromptChange(e.target.value) : onConverterPromptChange(e.target.value)}
                    className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-2 text-[9px] font-mono text-slate-400 focus:border-indigo-500 outline-none resize-y leading-relaxed"
                    spellCheck={false}
                    placeholder={appMode === CreatorMode.Generator ? "# ROLE..." : "# CONVERTER ROLE..."}
                />

                {outputFields.length > 0 && onFieldToggle && (
                    <FieldSelectionPanel
                        outputFields={outputFields}
                        selectedFields={generationParams.selectedFields || []}
                        onFieldToggle={onFieldToggle}
                        onResetToDefault={onResetFieldSelection || (() => { })}
                        onSelectAll={onSelectAllFields || (() => { })}
                        onDeselectAll={onDeselectAllFields || (() => { })}
                        showNativeToggle={outputFields.some(field => field.name === OutputFieldName.Reasoning)}
                        useNativeOutput={useNativeOutput}
                        onToggleNativeOutput={onToggleNativeOutput}
                    />
                )}
            </div>

            {(dataSourceMode === DataSource.HuggingFace || dataSourceMode === DataSource.Manual) && (
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-2">
                    <p className="text-[10px] text-slate-400">
                        When processing messages/conversation columns, limit the number of turns to rewrite:
                    </p>
                    <div className="flex items-center gap-3">
                        <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Max Traces
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={hfConfig.maxMultiTurnTraces || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onHfConfigChange({
                                ...hfConfig,
                                maxMultiTurnTraces: e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value) || 0)
                            })}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="All"
                        />
                        <span className="text-[10px] text-slate-500">Empty = process all traces</span>
                    </div>
                </div>
            )}
        </>
    );
}
