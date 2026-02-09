import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';

interface DetailPanelFooterProps {
    modelUsed?: string;
    sessionUid?: string;
    isDeep?: boolean;
    hasUnsavedChanges?: boolean;
    isMultiTurn?: boolean;
}

const ShortcutItem: React.FC<{ keys: string; description: string; variant?: 'default' | 'multi' | 'single' }> = ({ keys, description, variant = 'default' }) => {
    const bgClass = variant === 'multi' ? 'bg-purple-900/30 border-purple-700/50' : variant === 'single' ? 'bg-sky-900/30 border-sky-700/50' : 'bg-slate-800 border-slate-700';
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-slate-300 text-sm">{description}</span>
            <kbd className={`px-2 py-1 rounded text-xs font-mono border ${bgClass} text-slate-200 whitespace-nowrap`}>
                {keys}
            </kbd>
        </div>
    );
};

export const DetailPanelFooter: React.FC<DetailPanelFooterProps> = ({
    modelUsed,
    sessionUid,
    isDeep,
    hasUnsavedChanges,
    isMultiTurn
}) => {
    const [showShortcuts, setShowShortcuts] = useState(false);

    return (
        <>
            <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/50 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                    {modelUsed && (
                        <span className="truncate max-w-[250px]" title={modelUsed}>
                            Model: {modelUsed}
                        </span>
                    )}
                    {sessionUid && (
                        <span className="bg-slate-800/60 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700/50" title={`Session: ${sessionUid}`}>
                            Session: {sessionUid}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {isDeep && (
                            <span className="bg-sky-900/30 text-sky-400 px-2 py-0.5 rounded text-[10px] font-medium border border-sky-800/50">
                                Deep
                            </span>
                        )}
                        {hasUnsavedChanges && (
                            <span className="bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded text-[10px] font-medium border border-orange-800/50">
                                Unsaved
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setShowShortcuts(true)}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                        title="View all keyboard shortcuts"
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        Shortcuts
                    </button>
                </div>
            </div>

            {showShortcuts && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowShortcuts(false)}
                    />
                    <div className="relative bg-slate-950 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Keyboard className="w-4 h-4 text-sky-400" />
                                <h3 className="text-sm font-semibold text-slate-200">Keyboard Shortcuts</h3>
                            </div>
                            <button
                                onClick={() => setShowShortcuts(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto max-h-[60vh]">
                            <div className="space-y-4">
                                <section>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Navigation</h4>
                                    <div className="divide-y divide-slate-800/50">
                                        <ShortcutItem keys="ESC" description="Close panel / Cancel edit" />
                                        <ShortcutItem keys="← →" description="Navigate between items" />
                                        <ShortcutItem keys="Tab" description="Next section / message" />
                                        <ShortcutItem keys="Shift + Tab" description="Previous section / message" />
                                    </div>
                                </section>

                                <section>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Editing</h4>
                                    <div className="divide-y divide-slate-800/50">
                                        <ShortcutItem keys="Ctrl + S" description="Save changes" />
                                    </div>
                                </section>

                                <section>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Actions</h4>
                                    <div className="divide-y divide-slate-800/50">
                                        <ShortcutItem keys="Ctrl + Shift + A" description="Autoscore item" variant="single" />
                                        <ShortcutItem keys="Ctrl + Shift + C" description="Clear current field" variant="single" />
                                    </div>
                                </section>

                                <section>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Rewrite</h4>
                                    <div className="divide-y divide-slate-800/50">
                                        {isMultiTurn ? (
                                            <>
                                                <div className="py-2">
                                                    <span className="text-xs text-purple-400 font-medium">For Assistant messages:</span>
                                                </div>
                                                <ShortcutItem keys="Ctrl + R" description="Rewrite reasoning" variant="multi" />
                                                <ShortcutItem keys="Ctrl + A" description="Rewrite answer" variant="multi" />
                                                <ShortcutItem keys="Ctrl + B" description="Rewrite both" variant="multi" />
                                                <div className="py-2 mt-2 border-t border-slate-800">
                                                    <span className="text-xs text-sky-400 font-medium">For User messages:</span>
                                                </div>
                                                <ShortcutItem keys="Ctrl + Q" description="Rewrite query" variant="single" />
                                            </>
                                        ) : (
                                            <>
                                                <ShortcutItem keys="Ctrl + R" description="Rewrite reasoning" variant="single" />
                                                <ShortcutItem keys="Ctrl + A" description="Rewrite answer" variant="single" />
                                                <ShortcutItem keys="Ctrl + B" description="Rewrite both" variant="single" />
                                            </>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>

                        <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/30">
                            <p className="text-[10px] text-slate-500 text-center">
                                Press any key to start using shortcuts
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DetailPanelFooter;
