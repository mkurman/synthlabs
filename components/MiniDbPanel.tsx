
import React from 'react';
import { Database, Activity, Server, Upload } from 'lucide-react';

interface MiniDbPanelProps {
  totalRecords: number;
  sessionRecords: number;
  recentHistory: number[]; // Array of numbers representing recent generation counts per interval
  unsavedCount?: number;  // Number of items not yet saved to Firebase
  onSyncAll?: () => void; // Callback to sync all unsaved items
}

export default function MiniDbPanel({ totalRecords, sessionRecords, recentHistory, unsavedCount = 0, onSyncAll }: MiniDbPanelProps) {
  // Normalize history for sparkline (0 to 100 height)
  const max = Math.max(...recentHistory, 1);
  const points = recentHistory.map((val, i) => {
    const x = (i / (recentHistory.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 relative overflow-hidden group">
      <div className="flex justify-between items-start mb-3 relative z-10">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-pink-500" /> DB Status
        </h3>
        <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
          <span className={`w-1.5 h-1.5 rounded-full ${sessionRecords > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></span>
          <span className="text-[9px] font-mono text-slate-400">LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div>
          <span className="text-[10px] text-slate-500 block mb-0.5">Session</span>
          <span className="text-xl font-mono font-bold text-white tracking-tight">{sessionRecords.toLocaleString()}</span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-500 block mb-0.5">Total DB</span>
          <span className="text-xl font-mono font-bold text-pink-400 tracking-tight">{totalRecords.toLocaleString()}</span>
        </div>
      </div>

      {/* Sync All Button - shown when there are unsaved items */}
      {unsavedCount > 0 && onSyncAll && (
        <button
          onClick={onSyncAll}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 py-2 rounded-lg font-bold text-xs transition-all relative z-10"
        >
          <Upload className="w-3.5 h-3.5" />
          Sync {unsavedCount} Unsaved to DB
        </button>
      )}

      {/* Sparkline Overlay */}
      {recentHistory.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-20 pointer-events-none">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#ec4899', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#ec4899', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <path d={`M0,100 ${points} L100,100 Z`} fill="url(#grad)" stroke="none" />
            <polyline points={points} fill="none" stroke="#ec4899" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}
    </div>
  );
}
