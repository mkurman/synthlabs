import { Download, ShieldCheck, Upload } from 'lucide-react';
import { VerifierPanelTab } from '../../../interfaces/enums/VerifierPanelTab';

interface VerifierTabNavigationProps {
    activeTab: VerifierPanelTab;
    isImportReady: boolean;
    onTabClick: (tab: VerifierPanelTab, isBlocked: boolean) => void;
}

export default function VerifierTabNavigation({
    activeTab,
    isImportReady,
    onTabClick
}: VerifierTabNavigationProps) {
    return (
        <div className="flex justify-center mb-8">
            <div className="bg-slate-950 p-1 rounded-lg border border-slate-800/70 flex gap-1">
                {[VerifierPanelTab.Import, VerifierPanelTab.Review, VerifierPanelTab.Export].map((tab) => {
                    const isBlocked = !isImportReady && tab !== VerifierPanelTab.Import;
                    return (
                        <button
                            key={tab}
                            onClick={() => onTabClick(tab, isBlocked)}
                            disabled={isBlocked}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === tab
                                ? 'bg-slate-100 text-slate-900 shadow-sm'
                                : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                                } ${isBlocked ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-slate-300' : ''}`}
                        >
                            {tab === VerifierPanelTab.Import && <Upload className="w-4 h-4" />}
                            {tab === VerifierPanelTab.Review && <ShieldCheck className="w-4 h-4" />}
                            {tab === VerifierPanelTab.Export && <Download className="w-4 h-4" />}
                            {tab}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
