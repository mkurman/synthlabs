
import React, { useEffect, useState } from 'react';
import { Sparkles, Zap, Clock, Terminal, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, RefreshCcw, Database, AlertTriangle, AlertCircle, MessageCircle, Upload, Trash2, Loader2, ChevronDown, Edit3, Check, X, RotateCcw, Brain } from 'lucide-react';
import ReasoningHighlighter from './ReasoningHighlighter';
import { parseThinkTagsForDisplay } from '../utils/thinkTagParser';
import ConversationView from './ConversationView';
import StreamingConversationCard from './StreamingConversationCard';
import AutoResizeTextarea from './AutoResizeTextarea';
import CollapsibleThinkContent from './CollapsibleThinkContent';
import { SynthLogItem, StreamingConversationState } from '../types';
import { FeedDisplayMode, LogFeedRewriteTarget } from '../interfaces/enums';

interface LogFeedProps {
  logs: SynthLogItem[];
  pageSize: number;
  totalLogCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onRetry?: (id: string) => void;
  onRetrySave?: (id: string) => void;
  onSaveToDb?: (id: string) => void;
  onDelete?: (id: string) => void;
  onHalt?: (id: string) => void;
  retryingIds?: Set<string>;
  savingIds?: Set<string>;
  isProdMode?: boolean;
  // Map of concurrent streaming conversations
  streamingConversations?: Map<string, StreamingConversationState>;
  streamingVersion?: number;
  showLatestOnly?: boolean;
  onShowLatestOnlyChange?: (value: boolean) => void;
  isLoading?: boolean;
  displayMode?: FeedDisplayMode;
  // Inline editing props
  editingField?: { itemId: string; field: LogFeedRewriteTarget; originalValue: string } | null;
  editValue?: string;
  onStartEditing?: (itemId: string, field: LogFeedRewriteTarget, currentValue: string) => void;
  onSaveEditing?: () => void;
  onCancelEditing?: () => void;
  onEditValueChange?: (value: string) => void;
  // Rewriting props
  rewritingField?: { itemId: string; field: LogFeedRewriteTarget } | null;
  streamingContent?: string;
  onRewrite?: (itemId: string, field: LogFeedRewriteTarget) => void;
}

const LogFeed: React.FC<LogFeedProps> = ({
  logs, pageSize, totalLogCount, currentPage, onPageChange,
  onRetry, onRetrySave, onSaveToDb, onDelete, onHalt, retryingIds, savingIds, isProdMode,
  streamingConversations, streamingVersion, showLatestOnly = false, isLoading = false,
  displayMode = FeedDisplayMode.Default,
  editingField, editValue = '', onStartEditing, onSaveEditing, onCancelEditing, onEditValueChange,
  rewritingField, streamingContent, onRewrite
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Reset to page 1 if pageSize changes (handled by parent mostly, but safety check)
  useEffect(() => {
    if (currentPage > 1 && logs.length === 0 && totalLogCount > 0) {
      // If we are on a page with no logs but total says otherwise, maybe fetch issue or page size change
      onPageChange(1);
    }
  }, [pageSize]);

  useEffect(() => {
    if (showLatestOnly && currentPage !== 1) {
      onPageChange(1);
    }
  }, [showLatestOnly, currentPage, onPageChange]);

  useEffect(() => {
    if (streamingVersion !== undefined) {
      // No-op: ensures re-render tracking for streaming updates
    }
  }, [streamingVersion]);

  const getDisplayFields = (answer: string, reasoning: string) => {
    const parsed = parseThinkTagsForDisplay(answer || '');
    return {
      displayReasoning: reasoning || parsed.reasoning || '',
      displayAnswer: parsed.hasThinkTags ? parsed.answer : answer
    };
  };

  const hasActiveStreams = streamingConversations && streamingConversations.size > 0;
  const isInvalidLog = (item: SynthLogItem) => item.status === 'TIMEOUT' || item.status === 'ERROR' || item.isError;

  const streamingList = hasActiveStreams
    ? Array.from(streamingConversations!.values()).filter(s => s.phase !== 'idle')
    : [];

  const maxVisibleItems = pageSize === -1 ? Number.POSITIVE_INFINITY : pageSize;

  const visibleStreaming = maxVisibleItems === Number.POSITIVE_INFINITY
    ? streamingList
    : streamingList.slice(0, maxVisibleItems);

  const remainingSlots = maxVisibleItems === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(0, maxVisibleItems - visibleStreaming.length);

  const visibleLogs = remainingSlots === Number.POSITIVE_INFINITY
    ? logs
    : logs.slice(0, remainingSlots);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
        <Loader2 className="w-12 h-12 text-teal-500 mb-4 animate-spin" />
        <p className="text-slate-400 font-medium">Loading logs...</p>
      </div>
    );
  }

  // Show empty state only if no logs AND no active streaming
  if (totalLogCount === 0 && logs.length === 0 && !hasActiveStreams) {
    return (
      <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
        <Terminal className="w-12 h-12 text-slate-700 mb-4" />
        <p className="text-slate-500 font-medium">No data generated yet.</p>
        <p className="text-sm text-slate-600 mt-1">Configure the engine and press Start.</p>
      </div>
    );
  }

  // If only streaming (no logs yet), render just the streaming cards
  if (totalLogCount === 0 && logs.length === 0 && hasActiveStreams) {
    return (
      <div className="space-y-4">
        {visibleStreaming.map(streamState => (
          <StreamingConversationCard key={streamState.id} streamState={streamState} onDelete={onDelete} onHalt={onHalt} />
        ))}
      </div>
    );
  }

  // Calculate Pagination logic based on "Show Latest Only" mode
  const effectivePageSize = pageSize === -1 ? totalLogCount : pageSize;

  // Calculate total pages based on pageSize (independent of showLatestOnly)
  const totalPages = pageSize === -1 ? 1 : Math.ceil(totalLogCount / effectivePageSize);

  const safeCurrentPage = showLatestOnly ? 1 : Math.min(Math.max(1, currentPage), totalPages);

  // Helper to safely render content that might accidentally be an object
  const renderSafeContent = (content: any) => {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    return JSON.stringify(content, null, 2);
  };

  return (
    <div className="space-y-4">
      {/* Streaming Conversation Cards - Show active generations */}
      {hasActiveStreams && visibleStreaming.length > 0 && (
        <div className="space-y-4 mb-4">
          {visibleStreaming.map(streamState => (
            <StreamingConversationCard key={streamState.id} streamState={streamState} onDelete={onDelete} onHalt={onHalt} />
          ))}
        </div>
      )}

      {/* List View - Compact expandable rows */}
      {displayMode === FeedDisplayMode.List && (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800">
                <th className="w-8 p-2"></th>
                <th className="text-left text-[10px] font-bold text-slate-500 uppercase p-2">Query</th>
                <th className="text-left text-[10px] font-bold text-slate-500 uppercase p-2 w-32">Model</th>
                <th className="text-left text-[10px] font-bold text-slate-500 uppercase p-2 w-24">Time</th>
                <th className="text-right text-[10px] font-bold text-slate-500 uppercase p-2 w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.map((item) => {
                const isInvalid = isInvalidLog(item);
                const isExpanded = expandedIds.has(item.id);
                const { displayReasoning, displayAnswer } = getDisplayFields(item.answer || '', item.reasoning || '');
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors ${isInvalid ? 'bg-red-950/10' : ''}`}
                      onClick={() => toggleExpand(item.id)}
                    >
                      <td className="p-2 text-center">
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </td>
                      <td className="p-2">
                        <span className="text-sm text-slate-300 line-clamp-1">{renderSafeContent(item.query)}</span>
                      </td>
                      <td className="p-2">
                        <span className="text-[10px] text-slate-400">{item.modelUsed}</span>
                      </td>
                      <td className="p-2">
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </td>
                      <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {onDelete && (
                          <button
                            onClick={() => window.confirm("Delete?") && onDelete(item.id)}
                            className="p-1 hover:bg-red-950/30 rounded text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-950/30">
                        <td colSpan={5} className="p-4">
                          {item.isMultiTurn && item.messages ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              <h5 className="text-[10px] uppercase text-slate-500 font-bold mb-2 flex items-center gap-1">
                                <MessageCircle className="w-3 h-3" />
                                {item.messages.length} messages
                              </h5>
                              {item.messages.map((msg, idx) => (
                                <div key={idx} className={`text-xs p-2 rounded ${msg.role === 'user' ? 'bg-slate-800/50 text-slate-300' : 'bg-slate-900/50 text-slate-400'}`}>
                                  <span className={`text-[9px] font-bold uppercase ${msg.role === 'user' ? 'text-cyan-400' : 'text-emerald-400'}`}>
                                    {msg.role}
                                  </span>
                                  <CollapsibleThinkContent content={msg.content} className="mt-1" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="grid md:grid-cols-2 gap-4">
                              <div>
                                <h5 className="text-[10px] uppercase text-slate-500 font-bold mb-2 flex items-start gap-1"><Brain className="w-3 h-3" /><span className="font-medium">Thoughts</span></h5>
                                <p className="text-xs text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto">{displayReasoning || 'N/A'}</p>
                              </div>
                              <div>
                                <h5 className="text-[10px] uppercase text-slate-500 font-bold mb-2">Answer</h5>
                                <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">{renderSafeContent(displayAnswer) || 'N/A'}</p>
                              </div>
                            </div>
                          )}
                          {isInvalid && (
                            <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-400">
                              Error: {item.error || 'Unknown error'}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards View - Grid of full cards */}
      {displayMode === FeedDisplayMode.Cards && (
        <div className="grid grid-cols-auto gap-4">
          {visibleLogs.map((item) => {
            const isInvalid = isInvalidLog(item);
            const isTimeout = item.status === 'TIMEOUT';
            const { displayReasoning, displayAnswer } = getDisplayFields(item.answer || '', item.reasoning || '');

            return (
              <div key={item.id} className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-indigo-500/30 transition-colors group shadow-lg">
                {/* Card Header */}
                <div className="bg-slate-950/50 p-2.5 border-b border-slate-800 flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 line-clamp-2 font-sans">
                      {renderSafeContent(item.query)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] text-slate-500">
                      {item.modelUsed.length > 15 ? item.modelUsed.slice(0, 15) + '...' : item.modelUsed}
                    </span>
                    <span className="text-[9px] font-mono text-slate-600">
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </span>
                    {onDelete && (
                      <button
                        onClick={() => window.confirm("Delete?") && onDelete(item.id)}
                        className="p-1 hover:bg-red-950/30 rounded text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content Area */}
                {item.isMultiTurn && item.messages ? (
                  <div className="p-3 bg-slate-950/20 max-h-64 overflow-y-auto">
                    <h4 className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1 sticky top-0 bg-slate-950/90 py-1">
                      <MessageCircle className="w-3 h-3" />
                      {item.messages.length} messages
                    </h4>
                    <div className="space-y-2">
                      {item.messages.map((msg, idx) => (
                        <div key={idx} className={`text-[11px] p-2 rounded ${msg.role === 'user' ? 'bg-slate-800/50 text-slate-300' : 'bg-slate-900/50 text-slate-400'}`}>
                          <span className={`text-[9px] font-bold uppercase ${msg.role === 'user' ? 'text-cyan-400' : 'text-emerald-400'}`}>
                            {msg.role}
                          </span>
                          <CollapsibleThinkContent content={msg.content} className="mt-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 divide-x divide-slate-800">
                    {/* Reasoning */}
                    <div className="p-3 py-0 bg-slate-950/20 max-h-64 overflow-y-auto">
                      <h4 className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1 sticky top-0 bg-slate-950/90 py-1">
                        <Brain className="w-3 h-3" />Thoughts
                      </h4>
                      <p className="text-[11px] text-slate-400 whitespace-pre-wrap">{displayReasoning || 'N/A'}</p>
                    </div>

                    {/* Answer */}
                    <div className="p-3 py-0 bg-slate-950/10 max-h-64 overflow-y-auto">
                      <h4 className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1 sticky top-0 bg-slate-950/90 py-1">
                        Answer
                      </h4>
                      <p className="text-[11px] text-slate-300 whitespace-pre-wrap">{renderSafeContent(displayAnswer) || 'N/A'}</p>
                    </div>
                  </div>
                )}

                {/* Error Footer */}
                {isInvalid && (
                  <div className="p-2 bg-red-500/10 border-t border-red-500/20 text-[10px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {isTimeout ? 'Timeout' : 'Error'}: {item.error || 'Unknown'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Default View - Full stacked cards */}
      {displayMode === FeedDisplayMode.Default && visibleLogs.map((item) => {
        const isInvalid = isInvalidLog(item);
        const isTimeout = item.status === 'TIMEOUT';

        return (
          <div key={item.id} className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-indigo-500/30 transition-colors group shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* Card Header */}
            <div className="bg-slate-950/50 p-3 border-b border-slate-800 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Query</span>
                  <div className="flex items-center gap-1">
                    {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Query ? (
                      <>
                        <button onClick={onSaveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={onCancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        {onStartEditing && (
                          <button onClick={() => onStartEditing(item.id, LogFeedRewriteTarget.Query, item.query || '')} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                        {onRewrite && (
                          <button
                            onClick={() => onRewrite(item.id, LogFeedRewriteTarget.Query)}
                            disabled={rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Query}
                            className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                            title="AI Rewrite"
                          >
                            {rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Query ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Query ? (
                  <AutoResizeTextarea
                    value={editValue}
                    onChange={e => onEditValueChange?.(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-sm text-slate-200 outline-none min-h-[40px]"
                    placeholder="Enter query..."
                  />
                ) : rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Query ? (
                  <div className="text-sm font-medium text-teal-300 font-sans animate-pulse">
                    {streamingContent || 'Rewriting...'}
                  </div>
                ) : (
                  <div className="text-sm font-medium text-slate-200 truncate font-sans">
                    {renderSafeContent(item.query)}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 shrink-0">
                  {item.modelUsed.includes('Gemini') || item.modelUsed.includes('DEEP') ? (
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                      {item.deepMetadata ? <Layers className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                      {item.modelUsed.replace("DEEP: ", "Deep ")}
                    </span>
                  ) : item.isMultiTurn ? (
                    <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> Multi-Turn ({item.messages?.length || 0} msgs)
                    </span>
                  ) : (
                    <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {item.modelUsed}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {(() => {
                      if (!item.timestamp) return '--:--:--';
                      try {
                        if (typeof item.timestamp === 'string' && item.timestamp.includes('T')) {
                          return item.timestamp.split('T')[1]?.split('.')[0] || new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        }
                        return new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      } catch {
                        return '--:--:--';
                      }
                    })()}
                  </span>
                </div>

                {/* Generation Retry */}
                {isInvalid && onRetry && (
                  <button
                    onClick={() => onRetry(item.id)}
                    disabled={retryingIds?.has(item.id)}
                    className="flex items-center gap-1.5 bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-500/20 text-[10px] px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCcw className={`w-3 h-3 ${retryingIds?.has(item.id) ? 'animate-spin' : ''}`} />
                    Retry Gen
                  </button>
                )}

                {/* Storage Retry */}
                {item.storageError && onRetrySave && !isInvalid && (
                  <button
                    onClick={() => onRetrySave(item.id)}
                    disabled={retryingIds?.has(item.id)}
                    className="flex items-center gap-1.5 bg-amber-950/50 hover:bg-amber-900/50 text-amber-400 border border-amber-500/20 text-[10px] px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title={item.storageError}
                  >
                    <Database className="w-3 h-3" />
                    <AlertTriangle className="w-3 h-3" />
                    <span className="hidden sm:inline">Retry Save</span>
                  </button>
                )}

                {/* Save to DB Button - for unsaved items in prod mode */}
                {isProdMode && !item.savedToDb && !isInvalid && !item.storageError && onSaveToDb && (
                  <button
                    onClick={() => onSaveToDb(item.id)}
                    disabled={savingIds?.has(item.id)}
                    className="flex items-center gap-1.5 bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save to Firebase"
                  >
                    <Upload className={`w-3 h-3 ${savingIds?.has(item.id) ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline">Save to DB</span>
                  </button>
                )}

                {/* Delete Button */}
                {onDelete && (
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this log?")) {
                        onDelete(item.id);
                      }
                    }}
                    className="flex items-center gap-1.5 bg-slate-800/50 hover:bg-red-950/30 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 text-[10px] px-2 py-1 rounded-md transition-all"
                    title="Delete Log"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Deep Metadata Toggle / Info */}
            {item.deepMetadata && (
              <div className="bg-slate-950/30 border-b border-slate-800 px-4 py-2 flex gap-4 overflow-x-auto no-scrollbar">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Meta-Analysis</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={item.deepMetadata.meta}>{item.deepMetadata.meta}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Retrieval</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={item.deepMetadata.retrieval}>{item.deepMetadata.retrieval}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Derivation</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={item.deepMetadata.derivation}>{item.deepMetadata.derivation}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Writer</span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={item.deepMetadata.writer}>{item.deepMetadata.writer}</span>
                </div>
              </div>
            )}

            {/* Content Area - Multi-turn uses ConversationView, single-turn uses grid */}
            {item.isMultiTurn && item.messages ? (
              <div className="p-4 bg-slate-950/20">
                <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                  Conversation ({item.messages.length} messages)
                </h4>
                <ConversationView messages={item.messages} />
              </div>
            ) : (
              (() => {
                const { displayReasoning, displayAnswer } = getDisplayFields(item.answer || '', item.reasoning || '');
                return (
                  <div className="grid lg:grid-cols-2">
                    {/* Left: Reasoning Trace */}
                    <div className="p-4 border-r border-slate-800 bg-slate-950/20">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-2">
                          <Brain className="w-3 h-3" /><span className="font-medium">Thoughts</span>
                        </h4>
                        <div className="flex items-center gap-1">
                          {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Reasoning ? (
                            <>
                              <button onClick={onSaveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                <Check className="w-3 h-3" />
                              </button>
                              <button onClick={onCancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              {onStartEditing && (
                                <button onClick={() => onStartEditing(item.id, LogFeedRewriteTarget.Reasoning, item.reasoning || '')} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              {onRewrite && (
                                <button
                                  onClick={() => onRewrite(item.id, LogFeedRewriteTarget.Reasoning)}
                                  disabled={rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Reasoning}
                                  className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                  title="AI Rewrite"
                                >
                                  {rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Reasoning ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Reasoning ? (
                        <AutoResizeTextarea
                          value={editValue}
                          onChange={e => onEditValueChange?.(e.target.value)}
                          autoFocus
                          className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-sm text-slate-300 outline-none min-h-[100px]"
                          placeholder="Enter reasoning..."
                        />
                      ) : rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Reasoning ? (
                        <div className="text-sm text-teal-300 whitespace-pre-wrap animate-pulse">
                          {streamingContent || 'Rewriting...'}
                        </div>
                      ) : (
                        <ReasoningHighlighter text={displayReasoning} />
                      )}
                    </div>

                    {/* Right: Final Answer & Seed */}
                    <div className="flex flex-col">
                      <div className="p-4 flex-1">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-2">
                            Answer
                          </h4>
                          <div className="flex items-center gap-1">
                            {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Answer ? (
                              <>
                                <button onClick={onSaveEditing} className="p-1 text-green-400 hover:bg-green-900/30 rounded" title="Save">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button onClick={onCancelEditing} className="p-1 text-red-400 hover:bg-red-900/30 rounded" title="Cancel">
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                {onStartEditing && (
                                  <button onClick={() => onStartEditing(item.id, LogFeedRewriteTarget.Answer, item.answer || '')} className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded" title="Edit">
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}
                                {onRewrite && (
                                  <button
                                    onClick={() => onRewrite(item.id, LogFeedRewriteTarget.Answer)}
                                    disabled={rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Answer}
                                    className="p-1 text-slate-500 hover:text-teal-400 hover:bg-teal-900/30 rounded disabled:opacity-50"
                                    title="AI Rewrite"
                                  >
                                    {rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Answer ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {editingField?.itemId === item.id && editingField.field === LogFeedRewriteTarget.Answer ? (
                          <AutoResizeTextarea
                            value={editValue}
                            onChange={e => onEditValueChange?.(e.target.value)}
                            autoFocus
                            className="w-full bg-slate-900 border border-teal-500/50 rounded p-2 text-sm text-slate-300 outline-none min-h-[100px]"
                            placeholder="Enter answer..."
                          />
                        ) : rewritingField?.itemId === item.id && rewritingField.field === LogFeedRewriteTarget.Answer ? (
                          <div className="text-sm text-teal-300 whitespace-pre-wrap animate-pulse">
                            {streamingContent || 'Rewriting...'}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                            {renderSafeContent(displayAnswer)}
                          </p>
                        )}
                      </div>

                      <div className="p-3 bg-slate-950/50 border-t border-slate-800">
                        <h5 className="text-[10px] text-slate-500 mb-1">Seed Context</h5>
                        <p className="text-xs text-slate-600 italic line-clamp-2 font-serif opacity-70">
                          "{renderSafeContent(item.seed_preview)}"
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Generation Error */}
            {isInvalid && (
              <div className="p-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                {isTimeout ? `Generation Timeout: ${item.error || 'Timed out'}` : `Generation Error: ${item.error}`}
              </div>
            )}

            {/* Storage Error Display (in footer) */}
            {item.storageError && !isInvalid && (
              <div className="p-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                Storage Failed: {item.storageError}. Data exists locally but is not synced.
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination Controls - Hidden if Show Latest Only is active or Page Size is All */}
      {!showLatestOnly && pageSize !== -1 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
          <button
            onClick={() => onPageChange(1)}
            disabled={safeCurrentPage === 1}
            className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            disabled={safeCurrentPage === 1}
            className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-xs font-mono text-slate-400">
            Page <span className="text-white font-bold">{safeCurrentPage}</span> of {totalPages}
          </span>

          <button
            onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
            disabled={safeCurrentPage === totalPages}
            className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={safeCurrentPage === totalPages}
            className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 transition-colors"
            title="Last Page"
          >
            <ChevronsRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default LogFeed;
