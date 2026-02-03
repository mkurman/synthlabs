import { BrainCircuit, FileEdit, GitBranch, PenTool, Search } from 'lucide-react';
import { DeepPhase } from '../../interfaces/enums';
import { DeepConfig } from '../../types';
import DeepPhaseConfigPanel from '../DeepPhaseConfigPanel';

interface DeepPhaseTabsPanelProps {
    activeDeepTab: DeepPhase;
    onActiveDeepTabChange: (phase: DeepPhase) => void;
    deepConfig: DeepConfig;
    onUpdatePhase: (phase: 'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter', updates: Partial<DeepConfig['phases']['meta']>) => void;
    onCopyToAll: (phase: 'meta' | 'retrieval' | 'derivation' | 'writer' | 'rewriter') => void;
}

export default function DeepPhaseTabsPanel({
    activeDeepTab,
    onActiveDeepTabChange,
    deepConfig,
    onUpdatePhase,
    onCopyToAll
}: DeepPhaseTabsPanelProps) {
    return (
        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/70 mb-4 overflow-x-auto no-scrollbar">
                <button onClick={() => onActiveDeepTabChange(DeepPhase.Meta)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Meta ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}><BrainCircuit className="w-3.5 h-3.5" /></button>
                <button onClick={() => onActiveDeepTabChange(DeepPhase.Retrieval)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Retrieval ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}><Search className="w-3.5 h-3.5" /></button>
                <button onClick={() => onActiveDeepTabChange(DeepPhase.Derivation)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Derivation ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}><GitBranch className="w-3.5 h-3.5" /></button>
                <button onClick={() => onActiveDeepTabChange(DeepPhase.Writer)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Writer ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}><PenTool className="w-3.5 h-3.5" /></button>
                <button onClick={() => onActiveDeepTabChange(DeepPhase.Rewriter)} className={`p-2 rounded-md transition-all flex items-center gap-2 ${activeDeepTab === DeepPhase.Rewriter ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}><FileEdit className="w-3.5 h-3.5" /></button>
            </div>
            {activeDeepTab === DeepPhase.Writer && (
                <DeepPhaseConfigPanel
                    title="Step 4: The Writer (Synthesis)"
                    icon={<PenTool className="w-4 h-4" />}
                    phase={deepConfig.phases.writer}
                    onUpdatePhase={(updates) => onUpdatePhase('writer', updates)}
                    onCopyToAll={() => onCopyToAll('writer')}
                />
            )}
            {activeDeepTab === DeepPhase.Meta && (
                <DeepPhaseConfigPanel
                    title="Step 1: Meta-Analysis"
                    icon={<BrainCircuit className="w-4 h-4" />}
                    phase={deepConfig.phases.meta}
                    onUpdatePhase={(updates) => onUpdatePhase('meta', updates)}
                    onCopyToAll={() => onCopyToAll('meta')}
                />
            )}
            {activeDeepTab === DeepPhase.Retrieval && (
                <DeepPhaseConfigPanel
                    title="Step 2: Retrieval & Constraints"
                    icon={<Search className="w-4 h-4" />}
                    phase={deepConfig.phases.retrieval}
                    onUpdatePhase={(updates) => onUpdatePhase('retrieval', updates)}
                    onCopyToAll={() => onCopyToAll('retrieval')}
                />
            )}
            {activeDeepTab === DeepPhase.Derivation && (
                <DeepPhaseConfigPanel
                    title="Step 3: Logical Derivation"
                    icon={<GitBranch className="w-4 h-4" />}
                    phase={deepConfig.phases.derivation}
                    onUpdatePhase={(updates) => onUpdatePhase('derivation', updates)}
                    onCopyToAll={() => onCopyToAll('derivation')}
                />
            )}
            {activeDeepTab === DeepPhase.Rewriter && (
                <DeepPhaseConfigPanel
                    title="Step 5: Response Rewriter (Optional)"
                    icon={<FileEdit className="w-4 h-4" />}
                    phase={deepConfig.phases.rewriter}
                    onUpdatePhase={(updates) => onUpdatePhase('rewriter', updates)}
                    onCopyToAll={() => onCopyToAll('rewriter')}
                />
            )}
        </div>
    );
}
