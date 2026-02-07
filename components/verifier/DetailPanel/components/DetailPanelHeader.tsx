import React from 'react';
import { X, Save, RotateCcw, ChevronLeft, ChevronRight, Loader2, Star } from 'lucide-react';
import { VerifierItem } from '../../../../types';

interface DetailPanelHeaderProps {
    item: VerifierItem;
    currentIndex: number;
    totalItems: number;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onClose: () => void;
    onSave?: () => void;
    onRollback?: () => void;
    onScore: (score: number) => void;
    onDelete?: () => void;
    isSaving?: boolean;
    isRollingBack?: boolean;
    showPersistenceButtons?: boolean;
}

export const DetailPanelHeader: React.FC<DetailPanelHeaderProps> = ({
    item,
    currentIndex,
    totalItems,
    hasPrevious,
    hasNext,
    onPrevious,
    onNext,
    onClose,
    onSave,
    onRollback,
    onScore,
    onDelete,
    isSaving,
    isRollingBack,
    showPersistenceButtons
}) => {
    return (
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50 rounded-t-2xl">
            {/* Left: Navigation */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg p-1">
                    <button
                        onClick={onPrevious}
                        disabled={!hasPrevious}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Previous item (←)"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-mono text-slate-400 px-2">
                        {currentIndex + 1} / {totalItems}
                    </span>
                    <button
                        onClick={onNext}
                        disabled={!hasNext}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Next item (→)"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-700/70" title={`ID: ${item.id}`}>
                        ID: {item.id}
                    </span>

                    {item.isDuplicate && (
                        <span className="text-xs text-amber-400 bg-amber-950/30 px-2 py-1 rounded border border-amber-800/50">
                            Duplicate
                        </span>
                    )}
                </div>

                {/* Star Rating */}
                <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                        <button
                            key={star}
                            onClick={() => onScore(star)}
                            className="focus:outline-none transition-transform hover:scale-110 p-0.5"
                        >
                            <Star className={`w-5 h-5 ${(item.score || 0) >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-700'}`} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                {/* Save & Rollback Buttons */}
                {showPersistenceButtons && (
                    <>
                        <button
                            onClick={onSave}
                            disabled={isSaving || !item.hasUnsavedChanges}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isSaving
                                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-800/50'
                                    : item.hasUnsavedChanges
                                        ? 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border-emerald-800/50'
                                        : 'bg-slate-800/50 text-slate-500 border-slate-700/50 cursor-not-allowed'
                                }`}
                            title={item.hasUnsavedChanges ? "Save changes to database" : "No unsaved changes"}
                        >
                            {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5" />
                            )}
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>

                        <button
                            onClick={onRollback}
                            disabled={isRollingBack}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-900/20 border border-amber-800/50 rounded-lg transition-colors disabled:opacity-50"
                            title="Discard changes and reload from database"
                        >
                            {isRollingBack ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Rollback
                        </button>
                    </>
                )}

                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/20 border border-red-800/50 rounded-lg transition-colors"
                    >
                        <span>Delete</span>
                    </button>
                )}

                <button
                    onClick={onClose}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Close (ESC)"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default DetailPanelHeader;
