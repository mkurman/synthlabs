import ControlPanel from '../panels/ControlPanel';
import SessionConfigPanel from '../panels/SessionConfigPanel';
import { ProgressStats } from '../../types';
import { DataSource, Environment, CreatorMode } from '../../interfaces/enums';
import { PrefetchState } from '../../services/hfPrefetchService';
import { TaskType } from '../../interfaces/enums';

interface SidebarSessionPanelProps {
    sessionName: string | null;
    environment: Environment;
    onLoadSession: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSaveSession: () => void;
    onCloudLoadOpen: () => void;
    onCloudSave: () => void;
    appMode: CreatorMode;
    onAppModeChange: (mode: CreatorMode) => void;
    isRunning: boolean;
    isPaused: boolean;
    progress: ProgressStats;
    dataSourceMode: DataSource;
    prefetchState: PrefetchState | null;
    error: string | null;
    isStreamingEnabled: boolean;
    onStreamingChange: (enabled: boolean) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    totalLogCount: number;
    invalidLogCount: number;
    detectedTaskType: TaskType | null;
    autoRoutedPromptSet: string | null;
    showMiniDbPanel: boolean;
    dbStats: { total: number; session: number };
    sparklineHistory: number[];
    unsavedCount: number;
    onSyncAll: () => void;
    onRetryAllFailed: () => void;
    onStartNewSession: () => void;
}

export default function SidebarSessionPanel({
    sessionName,
    environment,
    onLoadSession,
    onSaveSession,
    onCloudLoadOpen,
    onCloudSave,
    appMode,
    onAppModeChange,
    isRunning,
    isPaused,
    progress,
    dataSourceMode,
    prefetchState,
    error,
    isStreamingEnabled,
    onStreamingChange,
    onStart,
    onPause,
    onResume,
    onStop,
    totalLogCount,
    invalidLogCount,
    detectedTaskType,
    autoRoutedPromptSet,
    showMiniDbPanel,
    dbStats,
    sparklineHistory,
    unsavedCount,
    onSyncAll,
    onRetryAllFailed,
    onStartNewSession
}: SidebarSessionPanelProps) {
    return (
        <>
            <SessionConfigPanel
                sessionName={sessionName}
                environment={environment}
                onLoadSession={onLoadSession}
                onSaveSession={onSaveSession}
                onCloudLoadOpen={onCloudLoadOpen}
                onCloudSave={onCloudSave}
            />

            <ControlPanel
                appMode={appMode}
                environment={environment}
                isRunning={isRunning}
                isPaused={isPaused}
                progress={progress}
                dataSourceMode={dataSourceMode}
                prefetchState={prefetchState}
                error={error}
                isStreamingEnabled={isStreamingEnabled}
                onStreamingChange={onStreamingChange}
                onAppModeChange={onAppModeChange}
                onStart={onStart}
                onPause={onPause}
                onResume={onResume}
                onStop={onStop}
                totalLogCount={totalLogCount}
                invalidLogCount={invalidLogCount}
                detectedTaskType={detectedTaskType}
                autoRoutedPromptSet={autoRoutedPromptSet}
                showMiniDbPanel={showMiniDbPanel}
                dbStats={dbStats}
                sparklineHistory={sparklineHistory}
                unsavedCount={unsavedCount}
                onSyncAll={onSyncAll}
                onRetryAllFailed={onRetryAllFailed}
                onStartNewSession={onStartNewSession}
            />
        </>
    );
}
