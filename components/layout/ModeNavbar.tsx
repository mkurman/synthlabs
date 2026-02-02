import { MainViewMode } from '../../interfaces/enums/MainViewMode';
import { BarChart3, ListOrdered } from 'lucide-react';

interface ModeNavbarProps {
    viewMode: MainViewMode;
    onViewModeChange: (mode: MainViewMode) => void;
}

export default function ModeNavbar({
    viewMode,
    onViewModeChange
}: ModeNavbarProps) {
    return (
        <nav className="bg-slate-900 border-b border-slate-800">
            <div className="flex items-center justify-end px-4 py-3">
                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
                    <button
                        onClick={() => onViewModeChange(MainViewMode.Feed)}
                        className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                            ${viewMode === MainViewMode.Feed
                                ? 'bg-slate-700 text-white'
                                : 'text-slate-400 hover:text-white'
                            }
                        `}
                    >
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span>Feed</span>
                    </button>

                    <button
                        onClick={() => onViewModeChange(MainViewMode.Analytics)}
                        className={`
                            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                            ${viewMode === MainViewMode.Analytics
                                ? 'bg-slate-700 text-white'
                                : 'text-slate-400 hover:text-white'
                            }
                        `}
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Analytics</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}
