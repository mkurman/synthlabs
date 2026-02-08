import React, { useState } from 'react';
import {
    AlertTriangle,
    Bot,
    Brain,
    Check,
    ChevronDown,
    ChevronUp,
    Edit3,
    Loader2,
    Maximize2,
    MessageCircle,
    RotateCcw,
    Save,
    Sparkles,
    Star,
    Trash2,
    User
} from 'lucide-react';
import { VerifierItem } from '../../../types';
import { VerifierDataSource } from '../../../interfaces/enums/VerifierDataSource';
import { parseThinkTagsForDisplay } from '../../../utils/thinkTagParser';
import ReasoningHighlighter from '../../ReasoningHighlighter';
import MarkdownRenderer from '../../MarkdownRenderer';

interface VerifierListItemProps {
    item: VerifierItem;
    dataIndex: number;
    isExpanded: boolean;
    isFocused: boolean;
    isSelected: boolean;
    itemState?: 'idle' | 'saving' | 'saved';
    dataSource: VerifierDataSource | null;
    onToggleExpand: () => void;
    onSelect: () => void;
    onFocus: () => void;
    onOpenDetail: () => void;
    onToggleDuplicate: () => void;
    onScore: (score: number) => void;
    onSaveToDb: () => void;
    onRollback: () => void;
    onDelete: () => void;
    onEditQuery: () => void;
    onEditReasoning: () => void;
    onEditAnswer: () => void;
    onRewriteQuery: () => void;
    onRewriteReasoning: () => void;
    onRewriteAnswer: () => void;
    isRewritingQuery: boolean;
    isRewritingReasoning: boolean;
    isRewritingAnswer: boolean;
    streamingContent?: string;
}

export const VerifierListItem: React.FC<VerifierListItemProps> = ({
    item,
    dataIndex,
    isExpanded,
    isFocused,
    isSelected,
    itemState,
    dataSource,
    onToggleExpand,
    onSelect,
    onFocus,
    onOpenDetail,
    onToggleDuplicate,
    onScore,
    onSaveToDb,
    onRollback,
    onDelete,
    onEditQuery,
    onEditReasoning,
    onEditAnswer,
    onRewriteQuery,
    onRewriteReasoning,
    onRewriteAnswer,
    isRewritingQuery,
    isRewritingReasoning,
    isRewritingAnswer,
    streamingContent
}) => {
    const parsedAnswer = parseThinkTagsForDisplay(item.answer || '');
    const displayReasoning = item.reasoning || parsedAnswer.reasoning || '';
    const displayAnswer = parsedAnswer.hasThinkTags ? parsedAnswer.answer : item.answer;
    const queryText = item.query || (item as any).QUERY || item.full_seed || '(No query)';

    // Status badge
    const getStatusBadge = () => {
        if (item.hasUnsavedChanges) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Modified
                </span>
            );
        }
        if (item.isDuplicate) {
            return (
                <button
                    onClick={onToggleDuplicate}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                    <AlertTriangle className="w-3 h-3" />
                    Duplicate
                </button>
            );
        }
        return null;
    };

    // Star rating
    const StarRating = () => (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    onClick={(e) => { e.stopPropagation(); onScore(star); }}
                    className="focus:outline-none transition-transform hover:scale-110 p-0.5"
                >
                    <Star className={`w-3.5 h-3.5 ${item.score >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`} />
                </button>
            ))}
        </div>
    );

    // Action buttons
    const ActionButton: React.FC<{
        onClick: (e: React.MouseEvent) => void;
        icon: React.ReactNode;
        title: string;
        variant?: 'default' | 'primary' | 'danger' | 'success';
        isLoading?: boolean;
    }> = ({ onClick, icon, title, variant = 'default', isLoading }) => {
        const variants = {
            default: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
            primary: 'text-sky-400 hover:text-sky-300 hover:bg-sky-900/30',
            danger: 'text-red-400 hover:text-red-300 hover:bg-red-900/30',
            success: 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30'
        };
        return (
            <button
                onClick={(e) => { e.stopPropagation(); onClick(e); }}
                disabled={isLoading}
                className={`p-1.5 rounded-md transition-all ${variants[variant]} disabled:opacity-50`}
                title={title}
            >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
            </button>
        );
    };

    // State for reasoning accordion in expanded view
    const [showReasoning, setShowReasoning] = useState(true);

    return (
        <div
            onClick={onFocus}
            onDoubleClick={onOpenDetail}
            className={`group relative bg-slate-900/50 border rounded-xl transition-all duration-200 overflow-hidden cursor-pointer ${
                isFocused 
                    ? 'border-sky-500/50 ring-1 ring-sky-500/20 shadow-lg shadow-sky-500/5' 
                    : 'border-slate-800 hover:border-slate-700'
            } ${item.hasUnsavedChanges ? 'border-l-4 border-l-orange-500/60' : ''}`}
        >
            {/* Header Row - Always visible */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50">
                {/* Checkbox & Number */}
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); onSelect(); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-sky-600 focus:ring-offset-slate-900 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-500 w-8">#{dataIndex}</span>
                </div>

                {/* ID & Status */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-mono text-slate-400" title={item.id}>
                        {item.id}
                    </span>
                    {getStatusBadge()}
                    {item.isMultiTurn && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <MessageCircle className="w-3 h-3" />
                            {item.messages?.length}
                        </span>
                    )}
                </div>

                {/* Score */}
                <StarRating />

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionButton
                        onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                        icon={<Maximize2 className="w-3.5 h-3.5" />}
                        title="Open Detail View"
                        variant="primary"
                    />
                    
                    {dataSource === VerifierDataSource.Database && item.hasUnsavedChanges && (
                        <>
                            <ActionButton
                                onClick={(e) => { e.stopPropagation(); onSaveToDb(); }}
                                icon={itemState === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                title={itemState === 'saved' ? 'Saved!' : 'Save to Database'}
                                variant={itemState === 'saved' ? 'success' : 'default'}
                                isLoading={itemState === 'saving'}
                            />
                            <ActionButton
                                onClick={(e) => { e.stopPropagation(); onRollback(); }}
                                icon={<RotateCcw className="w-3.5 h-3.5" />}
                                title="Rollback Changes"
                            />
                            <ActionButton
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                title="Delete"
                                variant="danger"
                            />
                        </>
                    )}
                    
                    {dataSource !== VerifierDataSource.Database && (
                        <ActionButton
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            title="Remove"
                            variant="danger"
                        />
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-all ml-1"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Compact Content Row */}
            <div 
                className={`px-4 py-3 cursor-pointer transition-all ${isExpanded ? '' : 'hover:bg-slate-800/30'}`}
                onClick={onToggleExpand}
            >
                {/* Query Preview */}
                <div className="flex items-start gap-2 mb-2">
                    <User className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <p className={`text-sm text-slate-200 leading-relaxed flex-1 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {queryText}
                    </p>
                </div>

                {/* Reasoning Preview (if not expanded) */}
                {!isExpanded && displayReasoning && (
                    <div className="flex items-start gap-2 ml-6 mb-2">
                        <Brain className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-slate-500 leading-relaxed line-clamp-2 flex-1 font-mono">
                            <ReasoningHighlighter text={displayReasoning} />
                        </div>
                    </div>
                )}

                {/* Answer Preview (if not expanded) */}
                {!isExpanded && displayAnswer && (
                    <div className="flex items-start gap-2 ml-6">
                        <Bot className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-slate-400 leading-relaxed line-clamp-2 flex-1">
                            <MarkdownRenderer content={displayAnswer} />
                        </div>
                    </div>
                )}
            </div>

            {/* Expanded Content */}
            {isExpanded && !item.isMultiTurn && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-800/50 pt-4">
                    {/* Query Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                <User className="w-3.5 h-3.5 text-sky-400" />
                                Query
                            </h4>
                            <div className="flex items-center gap-1">
                                <ActionButton
                                    onClick={(e) => { e.stopPropagation(); onEditQuery(); }}
                                    icon={<Edit3 className="w-3.5 h-3.5" />}
                                    title="Edit Query"
                                />
                                <ActionButton
                                    onClick={(e) => { e.stopPropagation(); onRewriteQuery(); }}
                                    icon={<Sparkles className="w-3.5 h-3.5" />}
                                    title="Rewrite Query"
                                    isLoading={isRewritingQuery}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                            {isRewritingQuery && streamingContent ? (
                                <p className="text-sm text-sky-300 animate-pulse whitespace-pre-wrap">
                                    {streamingContent}
                                    <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                </p>
                            ) : (
                                <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{queryText}</p>
                            )}
                        </div>
                    </div>

                    {/* Reasoning / Thoughts Section - Collapsible Accordion */}
                    {displayReasoning && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowReasoning(!showReasoning); }}
                                    className="flex items-center gap-2 text-xs font-semibold text-purple-300 uppercase tracking-wider hover:text-purple-200 transition-colors"
                                >
                                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                                    Thoughts
                                    {showReasoning ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                                <div className="flex items-center gap-1">
                                    <ActionButton
                                        onClick={(e) => { e.stopPropagation(); onEditReasoning(); }}
                                        icon={<Edit3 className="w-3.5 h-3.5" />}
                                        title="Edit Reasoning"
                                    />
                                    <ActionButton
                                        onClick={(e) => { e.stopPropagation(); onRewriteReasoning(); }}
                                        icon={<Sparkles className="w-3.5 h-3.5" />}
                                        title="Rewrite Reasoning"
                                        isLoading={isRewritingReasoning}
                                    />
                                </div>
                            </div>
                            {showReasoning && (
                                <div className="bg-purple-950/20 border border-purple-900/30 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                                    {isRewritingReasoning && streamingContent ? (
                                        <p className="text-sm text-sky-300 font-mono animate-pulse whitespace-pre-wrap leading-relaxed">
                                            {streamingContent}
                                            <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                        </p>
                                    ) : (
                                        <div className="text-sm text-slate-300 font-mono leading-relaxed">
                                            <ReasoningHighlighter text={displayReasoning} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Answer Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-emerald-300 flex items-center gap-2 uppercase tracking-wider">
                                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                Answer
                            </h4>
                            <div className="flex items-center gap-1">
                                <ActionButton
                                    onClick={(e) => { e.stopPropagation(); onEditAnswer(); }}
                                    icon={<Edit3 className="w-3.5 h-3.5" />}
                                    title="Edit Answer"
                                />
                                <ActionButton
                                    onClick={(e) => { e.stopPropagation(); onRewriteAnswer(); }}
                                    icon={<Sparkles className="w-3.5 h-3.5" />}
                                    title="Rewrite Answer"
                                    isLoading={isRewritingAnswer}
                                />
                            </div>
                        </div>
                        <div className="bg-emerald-950/10 border border-emerald-900/20 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                            {isRewritingAnswer && streamingContent ? (
                                <p className="text-sm text-sky-300 animate-pulse whitespace-pre-wrap leading-relaxed">
                                    {streamingContent}
                                    <span className="inline-block w-2 h-4 bg-sky-400 ml-1 animate-pulse" />
                                </p>
                            ) : displayAnswer ? (
                                <MarkdownRenderer content={displayAnswer} />
                            ) : (
                                <p className="text-sm text-slate-500 italic">No answer provided</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Multi-turn Conversation Preview */}
            {isExpanded && item.isMultiTurn && item.messages && (
                <div className="px-4 pb-4 border-t border-slate-800/50 pt-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-2">
                            <MessageCircle className="w-4 h-4" />
                            Conversation ({item.messages.length} messages)
                        </h4>
                    </div>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                        {item.messages.slice(0, 3).map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                    msg.role === 'user' ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-300'
                                }`}>
                                    {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                </div>
                                <div className={`flex-1 rounded-lg p-3 text-sm ${
                                    msg.role === 'user' 
                                        ? 'bg-sky-950/30 border border-sky-800/30 text-slate-200' 
                                        : 'bg-slate-950/50 border border-slate-800 text-slate-300'
                                }`}>
                                    <p className="line-clamp-3">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {item.messages.length > 3 && (
                            <p className="text-center text-xs text-slate-500">
                                +{item.messages.length - 3} more messages - open detail view to see all
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Footer Info */}
            <div className="px-4 py-2 border-t border-slate-800/30 bg-slate-900/30 flex items-center justify-between text-[10px] text-slate-500">
                <span className="truncate max-w-[150px]" title={item.modelUsed}>{item.modelUsed}</span>
                {item.sessionUid && (
                    <span className="font-mono bg-slate-800/60 px-2 py-0.5 rounded">
                        {item.sessionUid}
                    </span>
                )}
            </div>
        </div>
    );
};

export default VerifierListItem;
