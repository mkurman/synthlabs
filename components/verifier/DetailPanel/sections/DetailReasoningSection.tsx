import React from 'react';
import { Brain, Bot, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { VerifierItem } from '../../../../types';
import { VerifierRewriteTarget } from '../../../../interfaces/enums';
import AutoResizeTextarea from '../../../AutoResizeTextarea';
import ReasoningHighlighter from '../../../ReasoningHighlighter';
import { parseThinkTagsForDisplay, sanitizeReasoningContent } from '../../../../utils/thinkTagParser';

interface DetailReasoningSectionProps {
    item: VerifierItem;
    editState: { field: string; value: string; messageIndex?: number } | null;
    onEditStart: (field: string, value: string) => void;
    onEditChange: (value: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onRewrite: (field: VerifierRewriteTarget) => void;
    isRewriting: boolean;
    rewritingField?: { itemId: string; field: VerifierRewriteTarget } | null;
    streamingContent?: string;
    showRewriteDropdown: boolean;
    setShowRewriteDropdown: (show: boolean) => void;
}

export const DetailReasoningSection: React.FC<DetailReasoningSectionProps> = ({
    item,
    editState,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onRewrite,
    isRewriting,
    rewritingField,
    streamingContent,
    showRewriteDropdown,
    setShowRewriteDropdown
}) => {
    const isEditing = editState?.field === 'reasoning';
    const parsedAnswer = parseThinkTagsForDisplay(item.answer || '');
    const displayReasoning = sanitizeReasoningContent(item.reasoning || parsedAnswer.reasoning || '');

    const isRewritingThis = rewritingField?.itemId === item.id && 
        (rewritingField?.field === VerifierRewriteTarget.Reasoning || rewritingField?.field === VerifierRewriteTarget.Both);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    Reasoning Trace
                </h3>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowRewriteDropdown(!showRewriteDropdown)}
                            disabled={isRewriting}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-900/30 rounded disabled:opacity-50"
                        >
                            {isRewriting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Regenerate
                        </button>
                        {showRewriteDropdown && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl z-50 py-1 min-w-[160px]">
                                <button
                                    onClick={() => { setShowRewriteDropdown(false); onRewrite(VerifierRewriteTarget.Reasoning); }}
                                    className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                >
                                    <Brain className="w-3.5 h-3.5" /> Reasoning Only
                                </button>
                                <button
                                    onClick={() => { setShowRewriteDropdown(false); onRewrite(VerifierRewriteTarget.Answer); }}
                                    className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                                >
                                    <Bot className="w-3.5 h-3.5" /> Answer Only
                                </button>
                                <button
                                    onClick={() => { setShowRewriteDropdown(false); onRewrite(VerifierRewriteTarget.Both); }}
                                    className="w-full px-3 py-2 text-left text-xs text-sky-400 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-800"
                                >
                                    <Sparkles className="w-3.5 h-3.5" /> Both Together
                                </button>
                            </div>
                        )}
                    </div>
                    {isEditing ? (
                        <>
                            <button
                                onClick={onEditSave}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-900/30 rounded"
                            >
                                <Check className="w-3.5 h-3.5" />
                                Save
                            </button>
                            <button
                                onClick={onEditCancel}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                            >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onEditStart('reasoning', displayReasoning)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                        >
                            Edit
                        </button>
                    )}
                </div>
            </div>
            
            {isEditing ? (
                <AutoResizeTextarea
                    value={editState.value}
                    onChange={(e) => onEditChange(e.target.value)}
                    className="w-full bg-slate-950 border border-sky-500/50 rounded-lg p-4 text-sm text-slate-100 outline-none min-h-[300px] font-mono leading-relaxed"
                    autoFocus
                />
            ) : (
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                    {isRewritingThis && streamingContent ? (
                        <p className="text-sm text-sky-300 font-mono animate-pulse whitespace-pre-wrap leading-relaxed">
                            {streamingContent}
                            <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                        </p>
                    ) : (
                        <div className="text-sm leading-relaxed">
                            <ReasoningHighlighter text={displayReasoning || '(No reasoning)'} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DetailReasoningSection;
