
import React, { useEffect } from 'react';
import { Sparkles, Zap, Clock, Terminal, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, RefreshCcw, Database, AlertTriangle, AlertCircle, MessageCircle, Upload, Trash2, Repeat, Check, X } from 'lucide-react';
import ReasoningHighlighter from './ReasoningHighlighter';
import { parseThinkTagsForDisplay } from '../utils/thinkTagParser';
import ConversationView from './ConversationView';
import StreamingConversationCard from './StreamingConversationCard';
import { SynthLogItem, StreamingConversationState } from '../types';

interface LogFeedProps {
  logs: SynthLogItem[];
  pageSize: number;
  totalLogCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onRetry?: (id: string) => void;
  onRetrySave?: (id: string) => void;
  onSaveToDb?: (id: string) => void;
  onDeterministicReplay?: (id: string) => void;
  onAcceptReplay?: (id: string) => void;
  onDismissReplay?: (id: string) => void;
  onDelete?: (id: string) => void;
  onHalt?: (id: string) => void;
  retryingIds?: Set<string>;
  savingIds?: Set<string>;
  replayingIds?: Set<string>;
  isProdMode?: boolean;
  // Map of concurrent streaming conversations
  streamingConversations?: Map<string, StreamingConversationState>;
  streamingVersion?: number;
  showLatestOnly?: boolean;
  onShowLatestOnlyChange?: (value: boolean) => void;
}

const LogFeed: React.FC<LogFeedProps> = ({
  logs, pageSize, totalLogCount, currentPage, onPageChange,
  onRetry, onRetrySave, onSaveToDb, onDeterministicReplay, onAcceptReplay, onDismissReplay, onDelete, onHalt, retryingIds, savingIds, replayingIds, isProdMode,
  streamingConversations, streamingVersion, showLatestOnly = false
}) => {

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

  const buildDiffLines = (originalText: string, replayText: string) => {
    const originalLines = originalText.split('\n');
    const replayLines = replayText.split('\n');
    const maxLines = Math.max(originalLines.length, replayLines.length);
    const diff: Array<{ type: 'same' | 'removed' | 'added'; text: string; key: string }> = [];

    for (let i = 0; i < maxLines; i += 1) {
      const originalLine = originalLines[i];
      const replayLine = replayLines[i];
      if (originalLine === replayLine) {
        if (originalLine !== undefined) {
          diff.push({ type: 'same', text: originalLine, key: `${i}-same` });
        }
      } else {
        if (originalLine !== undefined) {
          diff.push({ type: 'removed', text: originalLine, key: `${i}-removed` });
        }
        if (replayLine !== undefined) {
          diff.push({ type: 'added', text: replayLine, key: `${i}-added` });
        }
      }
    }

    return diff;
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

      {visibleLogs.map((item) => {
        const isInvalid = isInvalidLog(item);
        const isTimeout = item.status === 'TIMEOUT';
        const hasReplay = !!item.replayAnswer || !!item.replayError;
        const baseOutput = renderSafeContent(item.answer || '');
        const replayOutput = item.replayAnswer ? renderSafeContent(item.replayAnswer) : '';
        const replayDiff = item.replayAnswer ? buildDiffLines(baseOutput, replayOutput) : [];
        const replayChanged = item.replayAnswer ? baseOutput !== replayOutput : false;

        return (
          <div key={item.id} className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-800 overflow-hidden hover:border-indigo-500/30 transition-colors group shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* Card Header */}
            <div className="bg-slate-950/50 p-3 border-b border-slate-800 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Query</span>
                </div>
                <div className="text-sm font-medium text-slate-200 truncate font-sans">
                  {renderSafeContent(item.query)}
                </div>
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

                {onDeterministicReplay && (
                  <button
                    onClick={() => onDeterministicReplay(item.id)}
                    disabled={replayingIds?.has(item.id)}
                    className="flex items-center gap-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/30 text-[10px] px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Deterministic Replay"
                  >
                    <Repeat className={`w-3 h-3 ${replayingIds?.has(item.id) ? 'animate-spin' : ''}`} />
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
                      <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Stenographic Trace
                      </h4>
                      <ReasoningHighlighter text={displayReasoning} />
                    </div>

                    {/* Right: Final Answer & Seed */}
                    <div className="flex flex-col">
                      <div className="p-4 flex-1">
                        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Final Output
                        </h4>
                        <p className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                          {renderSafeContent(displayAnswer)}
                        </p>
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

            {hasReplay && (
              <div className="border-t border-slate-800 bg-slate-950/40">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${item.replayError ? 'text-red-300' : replayChanged ? 'text-amber-300' : 'text-emerald-300'}`}>
                      Replay {item.replayError ? 'Failed' : replayChanged ? 'Different' : 'Match'}
                    </span>
                    {item.replayModelUsed && (
                      <span className="text-[10px] text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-full border border-slate-800">
                        {item.replayModelUsed}
                      </span>
                    )}
                    {item.replayDuration !== undefined && (
                      <span className="text-[10px] text-slate-500">
                        {item.replayDuration} ms
                      </span>
                    )}
                    {item.replayTimestamp && (
                      <span className="text-[10px] text-slate-600">
                        {new Date(item.replayTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {item.replayAnswer && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAcceptReplay?.(item.id)}
                        className="p-1.5 rounded-md bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 transition-colors"
                        title="Accept Replay"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDismissReplay?.(item.id)}
                        className="p-1.5 rounded-md bg-slate-900/60 hover:bg-slate-800 text-slate-400 border border-slate-700 transition-colors"
                        title="Dismiss Replay"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {item.replayError ? (
                  <div className="px-3 pb-3 text-xs text-red-300">
                    {item.replayError}
                  </div>
                ) : item.replayAnswer ? (
                  <div className="px-3 pb-3">
                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                      <div className="grid grid-cols-1 lg:grid-cols-2">
                        <div className="p-3 bg-slate-950/60">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Original</div>
                          <div className="text-xs text-slate-200 whitespace-pre-wrap">{baseOutput}</div>
                        </div>
                        <div className="p-3 bg-slate-950/40 border-t lg:border-t-0 lg:border-l border-slate-800">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Replay</div>
                          <div className="text-xs text-slate-200 whitespace-pre-wrap">{replayOutput}</div>
                        </div>
                      </div>
                      <div className="border-t border-slate-800 p-3 bg-slate-950/30">
                        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Diff</div>
                        <div className="font-mono text-[11px] whitespace-pre-wrap">
                          {replayDiff.map(line => (
                            <div
                              key={line.key}
                              className={
                                line.type === 'added'
                                  ? 'text-emerald-300 bg-emerald-950/30'
                                  : line.type === 'removed'
                                    ? 'text-red-300 bg-red-950/30'
                                    : 'text-slate-300'
                              }
                            >
                              {line.type === 'added' ? `+ ${line.text}` : line.type === 'removed' ? `- ${line.text}` : `  ${line.text}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
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
