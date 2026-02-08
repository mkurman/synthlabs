import React, { useRef } from 'react';
import { Archive, Bookmark, Upload, Save, CloudDownload, CloudUpload } from 'lucide-react';
import { Environment } from '../../interfaces/enums';

interface SessionConfigPanelProps {
  sessionName: string | null;
  environment: Environment;
  onLoadSession: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveSession: () => void;
  onCloudLoadOpen: () => void;
  onCloudSave: () => void;
}

export default function SessionConfigPanel({
  sessionName,
  environment,
  onLoadSession,
  onSaveSession,
  onCloudLoadOpen,
  onCloudSave
}: SessionConfigPanelProps) {
  const sessionFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-slate-950/70 rounded-xl border border-slate-800/70 p-3 px-4 flex flex-col gap-3 group hover:border-sky-500/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Archive className="w-3.5 h-3.5" /> Session Config
        </span>
        {sessionName && (
          <span className="text-[10px] font-bold text-sky-300 bg-sky-900/30 border border-sky-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 truncate max-w-[150px]">
            <Bookmark className="w-3 h-3" /> {sessionName}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input 
          type="file" 
          ref={sessionFileInputRef} 
          onChange={onLoadSession} 
          className="hidden" 
          accept=".json" 
        />
        <button 
          onClick={() => sessionFileInputRef.current?.click()} 
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900/60 hover:bg-slate-800/70 border border-slate-700/70 text-slate-200 text-[10px] px-2.5 py-2 rounded-md transition-colors"
        >
          <Upload className="w-3 h-3" /> Load File
        </button>
        <button 
          onClick={onSaveSession} 
          className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900/60 hover:bg-slate-800/70 border border-slate-700/70 text-slate-200 text-[10px] px-2.5 py-2 rounded-md transition-colors"
        >
          <Save className="w-3 h-3" /> Save File
        </button>
      </div>

      {environment === Environment.Production && (
        <div className="flex gap-2 pt-2 border-t border-slate-800/70 animate-in fade-in slide-in-from-top-1">
          <button 
            onClick={onCloudLoadOpen} 
            className="flex-1 flex items-center justify-center gap-1.5 bg-sky-950/40 hover:bg-sky-900/40 text-sky-300 border border-sky-500/20 text-[10px] px-2.5 py-2 rounded-md transition-colors"
          >
            <CloudDownload className="w-3 h-3" /> Cloud Load
          </button>
          <button 
            onClick={onCloudSave} 
            className="flex-1 flex items-center justify-center gap-1.5 bg-sky-950/40 hover:bg-sky-900/40 text-sky-300 border border-sky-500/20 text-[10px] px-2.5 py-2 rounded-md transition-colors"
          >
            <CloudUpload className="w-3 h-3" /> Cloud Save
          </button>
        </div>
      )}
    </div>
  );
}
