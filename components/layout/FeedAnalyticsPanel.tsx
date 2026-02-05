import AnalyticsDashboard from '../AnalyticsDashboard';
import FeedControlBar from './FeedControlBar';
import LogFeed from '../LogFeed';
import { SynthLogItem } from '../../types';
import { LogFilter, ViewMode } from '../../interfaces/enums';
import { StreamingConversationState } from '../../types';

export interface FeedAnalyticsPanelProps {
    viewMode: ViewMode;
    logFilter: LogFilter;
    hasInvalidLogs: boolean;
    showLatestOnly: boolean;
    feedPageSize: number;
    onViewModeChange: (mode: ViewMode) => void;
    onLogFilterChange: (filter: LogFilter) => void;
    onShowLatestOnlyChange: (value: boolean) => void;
    onFeedPageSizeChange: (size: number) => void;
    logs: SynthLogItem[];
    totalLogCount: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onRetry: (id: string) => void;
    onRetrySave: (id: string) => void;
    onSaveToDb: (id: string) => void;
    onDeterministicReplay: (id: string) => void;
    onAcceptReplay: (id: string) => void;
    onDismissReplay: (id: string) => void;
    onDelete: (id: string) => void;
    onHalt: (id: string) => void;
    retryingIds: Set<string>;
    replayingIds: Set<string>;
    savingIds: Set<string>;
    isProdMode: boolean;
    streamingConversations?: Map<string, StreamingConversationState>;
    streamingVersion: number;
}

export default function FeedAnalyticsPanel({
    viewMode,
    logFilter,
    hasInvalidLogs,
    showLatestOnly,
    feedPageSize,
    onViewModeChange,
    onLogFilterChange,
    onShowLatestOnlyChange,
    onFeedPageSizeChange,
    logs,
    totalLogCount,
    currentPage,
    onPageChange,
    onRetry,
    onRetrySave,
    onSaveToDb,
    onDeterministicReplay,
    onAcceptReplay,
    onDismissReplay,
    onDelete,
    onHalt,
    retryingIds,
    replayingIds,
    savingIds,
    isProdMode,
    streamingConversations,
    streamingVersion
}: FeedAnalyticsPanelProps) {
    return (
        <div className="lg:col-span-8">
            <FeedControlBar
                viewMode={viewMode}
                logFilter={logFilter}
                hasInvalidLogs={hasInvalidLogs}
                showLatestOnly={showLatestOnly}
                feedPageSize={feedPageSize}
                onViewModeChange={onViewModeChange}
                onLogFilterChange={onLogFilterChange}
                onShowLatestOnlyChange={onShowLatestOnlyChange}
                onFeedPageSizeChange={onFeedPageSizeChange}
            />

            {viewMode === ViewMode.Feed ? (
                <LogFeed
                    logs={logs}
                    pageSize={feedPageSize}
                    totalLogCount={totalLogCount}
                    currentPage={currentPage}
                    onPageChange={onPageChange}
                    onRetry={onRetry}
                    onRetrySave={onRetrySave}
                    onSaveToDb={onSaveToDb}
                    onDeterministicReplay={onDeterministicReplay}
                    onAcceptReplay={onAcceptReplay}
                    onDismissReplay={onDismissReplay}
                    onDelete={onDelete}
                    onHalt={onHalt}
                    retryingIds={retryingIds}
                    replayingIds={replayingIds}
                    savingIds={savingIds}
                    isProdMode={isProdMode}
                    streamingConversations={streamingConversations}
                    streamingVersion={streamingVersion}
                    showLatestOnly={showLatestOnly}
                    onShowLatestOnlyChange={onShowLatestOnlyChange}
                />
            ) : (
                <AnalyticsDashboard logs={logs} />
            )}
        </div>
    );
}
