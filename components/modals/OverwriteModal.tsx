import { AlertCircle, Download, PlusCircle, FileX } from 'lucide-react';

interface OverwriteModalProps {
  isOpen: boolean;
  totalLogCount: number;
  onDownloadAndContinue: () => void;
  onContinue: () => void;
  onStartNew: () => void;
  onCancel: () => void;
}

export default function OverwriteModal({
  isOpen,
  totalLogCount,
  onDownloadAndContinue,
  onContinue,
  onStartNew,
  onCancel
}: OverwriteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950/70 border border-slate-700/70 rounded-xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-sky-500" /> Continue Generation?
        </h3>
        
        <p className="text-slate-300 text-sm mb-6">
          You have <b>{totalLogCount}</b> generated items. You can continue adding to this session or download the data first.
        </p>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={onDownloadAndContinue}
            className="bg-sky-600 hover:bg-sky-500 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" /> Download & Continue
          </button>
          
          <button
            onClick={onContinue}
            className="bg-slate-900/60 text-white border border-slate-700/70 py-2.5 rounded-lg font-bold text-sm hover:bg-slate-800/70 flex items-center justify-center gap-2 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Continue (Append)
          </button>
          
          <div className="h-px bg-slate-900/60 my-1 w-full"></div>
          
          <button
            onClick={onStartNew}
            className="bg-red-950/30 text-red-400 border border-red-500/20 py-2 rounded-lg font-medium text-xs hover:bg-red-900/50 flex items-center justify-center gap-2 transition-all"
          >
            <FileX className="w-3.5 h-3.5" /> Start New (Clear Data)
          </button>
          
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 mt-1 hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
