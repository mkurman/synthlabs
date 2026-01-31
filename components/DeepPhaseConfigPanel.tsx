import React from 'react';
import { DeepPhaseConfig } from '../types';
import { ExternalProvider, ProviderType, ApiType } from '../interfaces/enums';
import { OutputFieldName } from '../interfaces/enums/OutputFieldName';
import { SettingsService } from '../services/settingsService';
import { EXTERNAL_PROVIDERS } from '../constants';
import ModelSelector from './ModelSelector';
import FieldSelectionPanel from './panels/FieldSelectionPanel';

interface DeepPhaseConfigPanelProps {
  title: string;
  icon: React.ReactNode;
  phase: DeepPhaseConfig;
  onUpdatePhase: (updates: Partial<DeepPhaseConfig>) => void;
  onCopyToAll: () => void;
}

export default function DeepPhaseConfigPanel({
  title,
  icon,
  phase,
  onUpdatePhase,
  onCopyToAll
}: DeepPhaseConfigPanelProps) {
  if (!phase) return null;

  return (
    <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-bottom-2 mt-2">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
          {icon} {title}
        </h4>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Enabled</label>
          <input 
            type="checkbox" 
            checked={phase.enabled} 
            onChange={e => onUpdatePhase({ enabled: e.target.checked })} 
            className="accent-indigo-500" 
          />
        </div>
      </div>
      
      {phase.enabled && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-bold uppercase">Provider</label>
            <select
              value={phase.provider === ProviderType.Gemini ? ProviderType.Gemini : phase.externalProvider}
              onChange={e => {
                const val = e.target.value;
                if (val === ProviderType.Gemini) {
                  onUpdatePhase({ provider: ProviderType.Gemini, model: 'gemini-2.0-flash-exp' });
                } else {
                  const newProvider = val as ExternalProvider;
                  const settings = SettingsService.getSettings();
                  const defaultModel = settings.providerDefaultModels?.[newProvider] || '';
                  onUpdatePhase({
                    provider: ProviderType.External,
                    externalProvider: newProvider,
                    apiKey: SettingsService.getApiKey(newProvider) || '',
                    model: defaultModel
                  });
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
            >
              <option value={ProviderType.Gemini}>Native Gemini</option>
              {EXTERNAL_PROVIDERS.map(ep => (
                <option key={ep} value={ep}>{ep === ExternalProvider.Other ? 'Custom Endpoint (other)' : ep.charAt(0).toUpperCase() + ep.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 font-bold uppercase">Model ID</label>
            <ModelSelector
              provider={phase.provider === ProviderType.Gemini ? ProviderType.Gemini : phase.externalProvider}
              value={phase.model}
              onChange={(model) => onUpdatePhase({ model })}
              apiKey={phase.provider === ProviderType.Gemini
                ? SettingsService.getApiKey('gemini')
                : (phase.apiKey || SettingsService.getApiKey(phase.externalProvider))}
              customBaseUrl={phase.customBaseUrl}
              placeholder="Select or enter model"
            />
          </div>

          {phase.provider === ProviderType.External && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">API Type</label>
              <select
                value={phase.apiType || ApiType.Chat}
                onChange={e => onUpdatePhase({ apiType: e.target.value as ApiType })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                title="API Type: chat=completions, responses=responses API"
              >
                <option value={ApiType.Chat}>Chat (Completions)</option>
                <option value={ApiType.Responses}>Responses API</option>
              </select>
            </div>
          )}

          {phase.provider === ProviderType.External && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">API Key</label>
              <input
                type="password"
                value={phase.apiKey || ''}
                onChange={e => onUpdatePhase({ apiKey: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                placeholder={SettingsService.getApiKey(phase.externalProvider) ? "Using Global Key (Settings)" : "Enter API Key..."}
              />
            </div>
          )}

          {phase.provider === ProviderType.External && phase.externalProvider === ExternalProvider.Other && (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Base URL</label>
              <input
                type="text"
                value={phase.customBaseUrl || ''}
                onChange={e => onUpdatePhase({ customBaseUrl: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500 outline-none"
                placeholder={SettingsService.getCustomBaseUrl() || "https://api.example.com/v1"}
              />
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-1">
        <div className="flex justify-between items-center mb-1">
          <label className="text-[10px] text-slate-500 font-bold uppercase">Phase System Prompt</label>
          <button 
            onClick={onCopyToAll} 
            className="text-[9px] text-indigo-400 hover:text-indigo-300 underline"
          >
            Apply Config to All Phases
          </button>
        </div>
        <textarea 
          value={phase.systemPrompt || ''} 
          onChange={e => onUpdatePhase({ systemPrompt: e.target.value })} 
          className="w-full h-32 bg-slate-950 border border-slate-700 rounded p-2 text-[10px] font-mono text-slate-300 focus:border-indigo-500 outline-none resize-y" 
          spellCheck={false} 
        />
      </div>

      {/* Field Selection for Deep Phase */}
      {phase.promptSchema?.output && phase.promptSchema.output.length > 0 && (
        <FieldSelectionPanel
          outputFields={phase.promptSchema.output}
          selectedFields={phase.selectedFields || phase.promptSchema.output.filter(f => !f.optional).map(f => f.name)}
          onFieldToggle={(fieldName: OutputFieldName) => {
            const currentSelected = phase.selectedFields || phase.promptSchema!.output.filter(f => !f.optional).map(f => f.name);
            const newSelected = currentSelected.includes(fieldName)
              ? currentSelected.filter(f => f !== fieldName)
              : [...currentSelected, fieldName];
            onUpdatePhase({ selectedFields: newSelected });
          }}
          onResetToDefault={() => {
            const defaultFields = phase.promptSchema!.output.filter(f => !f.optional).map(f => f.name);
            onUpdatePhase({ selectedFields: defaultFields });
          }}
          onSelectAll={() => {
            onUpdatePhase({ selectedFields: phase.promptSchema!.output.map(f => f.name) });
          }}
          onDeselectAll={() => {
            onUpdatePhase({ selectedFields: [] });
          }}
        />
      )}
    </div>
  );
}
