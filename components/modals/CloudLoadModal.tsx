import React from 'react';
import { Cloud, X, RefreshCcw, Archive, Calendar, Trash2 } from 'lucide-react';
import { CreatorMode, EngineMode } from '../../interfaces/enums';
import { SavedSession } from '../../services/firebaseService';

interface CloudLoadModalProps {
  isOpen: boolean;
  sessions: SavedSession[];
  isLoading: boolean;
  onSelect: (session: SavedSession) => void;
  onDelete: (sessionId: string, event: React.MouseEvent) => void;
  onClose: () => void;
}

export default function CloudLoadModal({
  isOpen,
  sessions,
  isLoading,
  onSelect,
  onDelete,
  onClose
}: CloudLoadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-indigo-500" /> Cloud Sessions
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <RefreshCcw className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500">
            <Archive className="w-12 h-12 mb-2 opacity-50" />
            <p>No saved sessions found in cloud.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {sessions.map(session => (
              <div
                key={session.id}
                onClick={() => onSelect(session)}
                className="group bg-slate-950/50 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-lg cursor-pointer transition-all flex justify-between items-center"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                    {session.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {new Date(session.createdAt).toLocaleString()}
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                      {session.config?.appMode === CreatorMode.Generator ? 'GEN' : 'CONV'}
                    </span>
                    {session.config?.engineMode === EngineMode.Deep && (
                      <span className="text-[10px] bg-indigo-900/30 text-indigo-400 px-1.5 py-0.5 rounded">
                        DEEP
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => onDelete(session.id, e)}
                  className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                  title="Delete Session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
