import { LayoutDashboard, List, Terminal, AlertCircle, Eye } from 'lucide-react';
import { ViewMode, LogFilter } from '../../interfaces/enums';

interface FeedControlBarProps {
  viewMode: ViewMode;
  logFilter: LogFilter;
  hasInvalidLogs: boolean;
  showLatestOnly: boolean;
  feedPageSize: number;
  onViewModeChange: (mode: ViewMode) => void;
  onLogFilterChange: (filter: LogFilter) => void;
  onShowLatestOnlyChange: (show: boolean) => void;
  onFeedPageSizeChange: (size: number) => void;
}

export default function FeedControlBar({
  viewMode,
  logFilter,
  hasInvalidLogs,
  showLatestOnly,
  feedPageSize,
  onViewModeChange,
  onLogFilterChange,
  onShowLatestOnlyChange,
  onFeedPageSizeChange
}: FeedControlBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
      {/* Left side controls */}
      <div className="flex items-center gap-3">
        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onViewModeChange(ViewMode.Feed)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === ViewMode.Feed
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            <List className="w-3.5 h-3.5" /> Feed
          </button>
          <button
            onClick={() => onViewModeChange(ViewMode.Analytics)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === ViewMode.Analytics
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Analytics
          </button>
        </div>

        {/* Log Filter Buttons (Feed Mode Only) */}
        {viewMode === ViewMode.Feed && (
          <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => onLogFilterChange(LogFilter.Live)}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                logFilter === LogFilter.Live 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : 'text-slate-500 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3 h-3" /> Live
            </button>
            <button
              onClick={() => onLogFilterChange(LogFilter.Invalid)}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${
                logFilter === LogFilter.Invalid
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                  : hasInvalidLogs
                    ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:text-rose-300 hover:bg-rose-500/20'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
              }`}
            >
              <AlertCircle className="w-3 h-3" /> Invalid
            </button>
          </div>
        )}

        {/* Show Latest Only Toggle */}
        {viewMode === ViewMode.Feed && (
          <button
            onClick={() => onShowLatestOnlyChange(!showLatestOnly)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all border ${
              showLatestOnly 
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' 
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
            }`}
          >
            <Eye className="w-3 h-3" /> Latest only
          </button>
        )}
      </div>

      {/* Right side controls */}
      {viewMode === ViewMode.Feed && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Page Size</label>
          <select
            value={feedPageSize}
            onChange={(e) => onFeedPageSizeChange(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
          >
            <option value="5">5</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="1000">1000</option>
            <option value="-1">All</option>
          </select>
        </div>
      )}
    </div>
  );
}
