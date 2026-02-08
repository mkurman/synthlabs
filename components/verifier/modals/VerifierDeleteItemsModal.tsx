import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface VerifierDeleteItemsModalProps {
    isOpen: boolean;
    itemsToDeleteCount: number;
    isDeleting: boolean;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

export default function VerifierDeleteItemsModal({
    isOpen,
    itemsToDeleteCount,
    isDeleting,
    onCancel,
    onConfirm
}: VerifierDeleteItemsModalProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-950/70 border border-slate-700/70 p-6 rounded-xl shadow-2xl max-w-md w-full mx-4">
                <div className="flex items-center gap-3 mb-4 text-red-500">
                    <div className="p-3 bg-red-500/10 rounded-full">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Delete from Database?</h3>
                </div>

                <p className="text-slate-200 mb-6">
                    Are you sure you want to permanently delete <span className="font-bold text-white">{itemsToDeleteCount}</span> item{itemsToDeleteCount !== 1 ? 's' : ''}?
                    <br /><br />
                    This action cannot be undone.
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                    </button>
                </div>
            </div>
        </div>
    );
}
