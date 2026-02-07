import React from 'react';

interface DetailPanelFooterProps {
    modelUsed?: string;
    sessionUid?: string;
    isDeep?: boolean;
    hasUnsavedChanges?: boolean;
}

export const DetailPanelFooter: React.FC<DetailPanelFooterProps> = ({
    modelUsed,
    sessionUid,
    isDeep,
    hasUnsavedChanges
}) => {
    return (
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/50 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
                {modelUsed && (
                    <span className="truncate max-w-[250px]" title={modelUsed}>
                        Model: {modelUsed}
                    </span>
                )}
                {sessionUid && (
                    <span className="bg-slate-800/60 text-slate-400 font-mono px-2 py-0.5 rounded border border-slate-700/50" title={`Session: ${sessionUid}`}>
                        Session: {sessionUid.slice(0, 8)}...
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
                <div className="flex items-center gap-3 text-[10px]">
                    <span>ESC to close</span>
                    <span>← → to navigate</span>
                    <span>Ctrl+S to save</span>
                    <span>Tab to switch sections</span>
                </div>
            </div>
        </div>
    );
};

export default DetailPanelFooter;
