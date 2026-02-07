import React from 'react';
import { User, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { VerifierItem } from '../../../../types';
import AutoResizeTextarea from '../../../AutoResizeTextarea';

interface DetailQuerySectionProps {
    item: VerifierItem;
    editState: { field: string; value: string; messageIndex?: number } | null;
    onEditStart: (field: string, value: string) => void;
    onEditChange: (value: string) => void;
    onEditSave: () => void;
    onEditCancel: () => void;
    onRewrite: () => void;
    isRewriting: boolean;
    streamingContent?: string;
    showRewriteDropdown: boolean;
    setShowRewriteDropdown: (show: boolean) => void;
}

export const DetailQuerySection: React.FC<DetailQuerySectionProps> = ({
    item,
    editState,
    onEditStart,
    onEditChange,
    onEditSave,
    onEditCancel,
    onRewrite,
    isRewriting,
    streamingContent
}) => {
    const isEditing = editState?.field === 'query';
    const query = item.query || (item as any).QUERY || item.full_seed || '';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <User className="w-4 h-4 text-sky-400" />
                    Query
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
                        <>
                            <button
                                onClick={() => onEditStart('query', query)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            >
                                Edit
                            </button>
                            <button
                                onClick={onRewrite}
                                disabled={isRewriting}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-900/30 rounded disabled:opacity-50"
                            >
                                {isRewriting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                )}
                                Rewrite
                            </button>
                        </>
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
                    {isRewriting && streamingContent ? (
                        <p className="text-sm text-sky-300 animate-pulse whitespace-pre-wrap leading-relaxed min-h-[40px]">
                            {streamingContent}
                            <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                        </p>
                    ) : (
                        <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                            {query || '(No query)'}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default DetailQuerySection;
