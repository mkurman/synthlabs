import React from 'react';
import { CheckSquare, Square, RotateCcw, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { OutputField } from '../../interfaces/types/PromptSchema';
import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';

interface FieldSelectionPanelProps {
  outputFields: OutputField[];
  selectedFields: OutputFieldName[];
  onFieldToggle: (fieldName: OutputFieldName) => void;
  onResetToDefault: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  showNativeToggle?: boolean;
  useNativeOutput?: boolean;
  onToggleNativeOutput?: (value: boolean) => void;
}

export default function FieldSelectionPanel({
  outputFields,
  selectedFields,
  onFieldToggle,
  onResetToDefault,
  onSelectAll,
  onDeselectAll,
  showNativeToggle = false,
  useNativeOutput = false,
  onToggleNativeOutput
}: FieldSelectionPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const selectedSet = new Set(selectedFields);
  const selectedCount = selectedFields.length;
  const totalCount = outputFields.length;
  const allSelected = selectedCount === totalCount;
  const noneSelected = selectedCount === 0;

  if (outputFields.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 bg-slate-900/60 border border-slate-700/70 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/60 hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-200 font-bold uppercase">
            Output Fields
          </span>
          <span className="text-[9px] text-slate-300 bg-slate-800/60 px-1.5 py-0.5 rounded">
            {selectedCount}/{totalCount}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-slate-300" />
        ) : (
          <ChevronDown className="w-3 h-3 text-slate-300" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          <p className="text-[9px] text-slate-400 leading-relaxed">
            Uncheck fields you don't want to generate. Unselected fields will use existing values from the data source.
          </p>

          {showNativeToggle && (
            <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800/70 rounded px-2 py-1.5">
              <div className="text-[9px] text-slate-200">
                Get native
                <span className="text-[9px] text-slate-400 ml-1">(ignore schema, parse &lt;think&gt; or reasoning_content)</span>
              </div>
              <input
                type="checkbox"
                checked={useNativeOutput}
                onChange={(e) => onToggleNativeOutput?.(e.target.checked)}
                className="accent-sky-500"
              />
            </label>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={onSelectAll}
              disabled={allSelected}
              className="flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800/70 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-[9px] px-2 py-1 rounded transition-colors"
            >
              <Check className="w-2.5 h-2.5" /> Select All
            </button>
            <button
              onClick={onDeselectAll}
              disabled={noneSelected}
              className="flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800/70 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-[9px] px-2 py-1 rounded transition-colors"
            >
              <X className="w-2.5 h-2.5" /> Deselect All
            </button>
            <button
              onClick={onResetToDefault}
              className="flex items-center gap-1 bg-slate-800/60 hover:bg-slate-800/70 text-slate-200 text-[9px] px-2 py-1 rounded transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          </div>

          <div className="space-y-1">
            {outputFields.map((field) => {
              const isSelected = selectedSet.has(field.name);
              const isRequired = !field.optional;

              return (
                <label
                  key={field.name}
                  className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-800/60' : 'bg-slate-900/60 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onFieldToggle(field.name)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-slate-200">
                        {field.name}
                      </span>
                      {isRequired && (
                        <span className="text-[8px] text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded">
                          Required
                        </span>
                      )}
                      {field.optional && (
                        <span className="text-[8px] text-slate-400 bg-slate-500/10 px-1 py-0.5 rounded">
                          Optional
                        </span>
                      )}
                    </div>
                    {field.description && (
                      <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">
                        {field.description}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
