
import React, { useState, useEffect } from 'react';
import { Sparkles, Zap, Clock, Terminal, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Layers, RefreshCcw, Database, AlertTriangle, Eye, AlertCircle, MessageCircle, Upload, Trash2 } from 'lucide-react';
import ReasoningHighlighter from './ReasoningHighlighter';
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
  onDelete?: (id: string) => void;
  retryingIds?: Set<string>;
  savingIds?: Set<string>;
  isProdMode?: boolean;
  // Map of concurrent streaming conversations
  streamingConversations?: Map<string, StreamingConversationState>;
}

const LogFeed: React.FC<LogFeedProps> = ({
  logs, pageSize, totalLogCount, currentPage, onPageChange,
  onRetry, onRetrySave, onSaveToDb, onDelete, retryingIds, savingIds, isProdMode,
  streamingConversations
}) => {
  const [showLatestOnly, setShowLatestOnly] = useState(false);

  // Reset to page 1 if pageSize changes (handled by parent mostly, but safety check)
  useEffect(() => {
    if (currentPage > 1 && logs.length === 0 && totalLogCount > 0) {
      // If we are on a page with no logs but total says otherwise, maybe fetch issue or page size change
      onPageChange(1);
    }
  }, [pageSize]);

  const hasActiveStreams = streamingConversations && streamingConversations.size > 0;

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
        {Array.from(streamingConversations.values()).map(streamState => (
          <StreamingConversationCard key={streamState.id} streamState={streamState} onDelete={onDelete} />
        ))}
      </div>
    );
  }

  // Calculate Pagination logic based on "Show Latest Only" mode
  const effectivePageSize = pageSize === -1 ? totalLogCount : pageSize;

  // If "Show Latest Only" is enabled, we force view to the first "page" of size pageSize
  // effectively showing only the top N items.
  const isAll = pageSize === -1 || showLatestOnly;

  // If Show Latest is ON, total pages is effectively 1 (hidden)
  const totalPages = isAll ? 1 : Math.ceil(totalLogCount / effectivePageSize);

  const safeCurrentPage = showLatestOnly ? 1 : Math.min(Math.max(1, currentPage), totalPages);

  // If showing latest only, parent should have passed the *first* page logs already
  // If showing all, parent splits
  const visibleLogs = logs; // Parent handles slicing now!

  // Helper to safely render content that might accidentally be an object
  const renderSafeContent = (content: any) => {
    if (content === null || content === undefined) return '';
    if (typeof content === 'string') return content;
    return JSON.stringify(content, null, 2);
  };

  return (
    <div className="space-y-4">
      {/* Show Latest Only Toggle - Inline with feed header controls in spirit, but placed here for flow */}
      <div className="flex justify-end -mt-10 mb-6 mr-36">
        <button
          onClick={() => setShowLatestOnly(!showLatestOnly)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all border ${showLatestOnly ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'}`}
        >
          <Eye className="w-3 h-3" /> Show Latest Only
        </button>
      </div>

      {/* Streaming Conversation Cards - Show active generations */}
      {hasActiveStreams && (
        <div className="space-y-4 mb-4">
          {Array.from(streamingConversations!.values())
            .filter(s => s.phase !== 'idle')
            .map(streamState => (
              <StreamingConversationCard key={streamState.id} streamState={streamState} onDelete={onDelete} />
            ))}
        </div>
      )}

      {visibleLogs.map((item) => (
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
              {item.isError && onRetry && (
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
              {item.storageError && onRetrySave && !item.isError && (
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
              {isProdMode && !item.savedToDb && !item.isError && !item.storageError && onSaveToDb && (
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
            <div className="grid lg:grid-cols-2">
              {/* Left: Reasoning Trace */}
              <div className="p-4 border-r border-slate-800 bg-slate-950/20">
                <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Stenographic Trace
                </h4>
                <ReasoningHighlighter text={item.reasoning} />
              </div>

              {/* Right: Final Answer & Seed */}
              <div className="flex flex-col">
                <div className="p-4 flex-1">
                  <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Final Output
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                    {renderSafeContent(item.answer)}
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
          )}

          {/* Generation Error */}
          {item.isError && (
            <div className="p-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Generation Error: {item.error}
            </div>
          )}

          {/* Storage Error Display (in footer) */}
          {item.storageError && !item.isError && (
            <div className="p-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
              <Database className="w-3.5 h-3.5" />
              Storage Failed: {item.storageError}. Data exists locally but is not synced.
            </div>
          )}
        </div>
      ))}

      {/* Pagination Controls - Hidden if Show Latest Only is active */}
      {!showLatestOnly && !isAll && totalPages > 1 && (
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
