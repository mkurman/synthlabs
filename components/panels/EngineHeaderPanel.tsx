import React from 'react';
import { Cpu, FileText } from 'lucide-react';
import { EngineMode } from '../../interfaces/enums';
import { SettingsService } from '../../services/settingsService';

interface EngineHeaderPanelProps {
    engineMode: EngineMode;
    onEngineModeChange: (mode: EngineMode) => void;
    sessionPromptSet: string | null;
    onSessionPromptSetChange: (value: string | null) => void;
    availablePromptSets: string[];
}

export default function EngineHeaderPanel({
    engineMode,
    onEngineModeChange,
    sessionPromptSet,
    onSessionPromptSetChange,
    availablePromptSets
}: EngineHeaderPanelProps) {
    return (
        <>
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-slate-400" /> ENGINE
                </h3>
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                    <button onClick={() => onEngineModeChange(EngineMode.Regular)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${engineMode === EngineMode.Regular ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>REGULAR</button>
                    <button onClick={() => onEngineModeChange(EngineMode.Deep)} className={`px-2 py-1 text-[10px] font-bold rounded transition-all flex items-center gap-1 ${engineMode === EngineMode.Deep ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                        DEEP
                    </button>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Prompts (Session)
                </label>
                <div className="flex gap-1">
                    <select
                        value={sessionPromptSet || ''}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSessionPromptSetChange(e.target.value || null)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                    >
                        <option value="">{SettingsService.getSettings().promptSet || 'default'} (your default)</option>
                        {availablePromptSets.filter((s: string) => s !== (SettingsService.getSettings().promptSet || 'default')).map((setId: string) => (
                            <option key={setId} value={setId}>{setId}</option>
                        ))}
                    </select>
                    {sessionPromptSet && (
                        <button
                            onClick={() => onSessionPromptSetChange(null)}
                            className="px-2 py-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                            title="Reset to your default prompt set"
                        >
                            Reset
                        </button>
                    )}
                </div>
                {sessionPromptSet && (
                    <p className="text-[9px] text-amber-400/70">
                        Session override active — will not persist after reload
                    </p>
                )}
            </div>
        </>
    );
}
