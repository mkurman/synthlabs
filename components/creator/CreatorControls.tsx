import { Dispatch, SetStateAction, useState } from 'react';
import { Database, Cpu, Edit3 } from 'lucide-react';
import {
    SidebarPanelProps
} from '../layout/SidebarPanel';
import SidebarEnginePanel from '../layout/SidebarEnginePanel';
import SidebarDataSourcePanel from '../layout/SidebarDataSourcePanel';
import GeneratorStatus from './GeneratorStatus';
import LogFeedRewriterPanel from '../feed/LogFeedRewriterPanel';
import { HuggingFaceConfig } from '../../types';
import { RewriterConfig } from '../../services/verifierRewriterService';
import { CreatorControlsTab } from '../../interfaces/enums';

type CreatorControlsProps = Omit<SidebarPanelProps, 'onLoadSession' | 'onSaveSession' | 'onCloudLoadOpen' | 'onCloudSave' | 'onStartNewSession'> & {
    setHfConfig: Dispatch<SetStateAction<HuggingFaceConfig>>;
    feedRewriterConfig?: RewriterConfig;
    onFeedRewriterConfigChange?: (config: RewriterConfig) => void;
};

export default function CreatorControls(props: CreatorControlsProps) {
    const [activeTab, setActiveTab] = useState<CreatorControlsTab>(CreatorControlsTab.DataSource);

    const {
        environment,
        isRunning,
        isPaused,
        progress,
        onStart,
        onPause,
        onResume,
        onStop,
        onRetryAllFailed,
        totalLogCount,
        invalidLogCount,
        dbStats,
        sparklineHistory,
        unsavedCount,
        onSyncAll,
        showMiniDbPanel
    } = props;

    const tabs = [
        { id: CreatorControlsTab.DataSource, label: 'Data', icon: Database },
        { id: CreatorControlsTab.Engine, label: 'Engine', icon: Cpu },
        { id: CreatorControlsTab.Inline, label: 'Inline', icon: Edit3 }
    ];

    return (
        <div className="h-full flex flex-col bg-slate-950/70 overflow-hidden">
            {/* 1. Top Status Section - Always visible */}
            <div className="flex-shrink-0">
                <GeneratorStatus
                    environment={environment}
                    isRunning={isRunning}
                    isPaused={isPaused}
                    progress={progress}
                    onStart={onStart}
                    onPause={onPause}
                    onResume={onResume}
                    onStop={onStop}
                    onRetryAllFailed={onRetryAllFailed}
                    totalLogCount={totalLogCount}
                    invalidLogCount={invalidLogCount}
                    dbStats={dbStats}
                    sparklineHistory={sparklineHistory}
                    unsavedCount={unsavedCount}
                    onSyncAll={onSyncAll}
                    showMiniDbPanel={showMiniDbPanel}
                    isStreamingEnabled={props.isStreamingEnabled}
                    onStreamingChange={props.onStreamingChange}
                />
            </div>

            {/* 2. Tab Bar */}
            <div className="flex-shrink-0 border-b border-slate-800/70 bg-slate-950/70">
                <div className="flex">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${isActive
                                        ? 'text-slate-900 bg-slate-100'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 3. Scrollable Configuration Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {/* Data Source Tab */}
                {activeTab === CreatorControlsTab.DataSource && (
                    <div className="animate-in fade-in duration-200">
                        <SidebarDataSourcePanel
                            {...props}
                            setHfConfig={props.onHfConfigChange}
                        />
                    </div>
                )}

                {/* Engine Tab */}
                {activeTab === CreatorControlsTab.Engine && (
                    <div className="animate-in fade-in duration-200">
                        <SidebarEnginePanel
                            {...props}
                        />
                    </div>
                )}

                {/* Inline Rewriter Tab */}
                {activeTab === CreatorControlsTab.Inline && (
                    <div className="animate-in fade-in duration-200">
                        {props.feedRewriterConfig && props.onFeedRewriterConfigChange ? (
                            <LogFeedRewriterPanel
                                rewriterConfig={props.feedRewriterConfig}
                                onRewriterConfigChange={props.onFeedRewriterConfigChange}
                            />
                        ) : (
                            <div className="text-xs text-slate-400 bg-slate-900/60 rounded-lg p-4 text-center">
                                Rewriter not configured.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
