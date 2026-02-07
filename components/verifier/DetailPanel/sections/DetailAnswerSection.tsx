import React from 'react';
import { Bot, Check, X } from 'lucide-react';
import { VerifierItem } from '../../../../types';
import { VerifierRewriteTarget } from '../../../../interfaces/enums';
import AutoResizeTextarea from '../../../AutoResizeTextarea';
import { parseThinkTagsForDisplay } from '../../../../utils/thinkTagParser';

interface DetailAnswerSectionProps {
    item: VerifierItem;
    editState: { field: string; value: string; messageIndex?: number } | null;
    onEditStart: (field: string, value: string) => void;
    onEditChange: (value: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    rewritingField?: { itemId: string; field: VerifierRewriteTarget } | null;
    streamingContent?: string;
}

export const DetailAnswerSection: React.FC<DetailAnswerSectionProps> = ({
    item,
    editState,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    rewritingField,
    streamingContent
}) => {
    const isEditing = editState?.field === 'answer';
    const parsedAnswer = parseThinkTagsForDisplay(item.answer || '');
    const displayAnswer = parsedAnswer.hasThinkTags ? parsedAnswer.answer : item.answer;
    
    const isRewritingThis = rewritingField?.itemId === item.id && 
        (rewritingField?.field === VerifierRewriteTarget.Answer || rewritingField?.field === VerifierRewriteTarget.Both);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    Answer
                </h3>
                <div className="flex items-center gap-2">
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
                            onClick={() => onEditStart('answer', item.answer || '')}
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
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onEditChange(e.target.value)}
                    className="w-full bg-slate-950 border border-sky-500/50 rounded-lg p-4 text-sm text-slate-100 outline-none min-h-[200px] leading-relaxed"
                    autoFocus
                />
            ) : (
                <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-4 min-h-[100px]">
                    {isRewritingThis && streamingContent ? (
                        <p className="text-sm text-sky-300 font-mono whitespace-pre-wrap animate-pulse leading-relaxed">
                            {streamingContent}
                            <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                        </p>
                    ) : (
                        <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                            {displayAnswer || '(No answer)'}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default DetailAnswerSection;
