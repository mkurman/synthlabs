import AnalyticsDashboard from '../AnalyticsDashboard';
import FeedControlBar from './FeedControlBar';
import LogFeed from '../LogFeed';
import { SynthLogItem } from '../../types';
import { LogFilter, ViewMode, FeedDisplayMode, LogFeedRewriteTarget } from '../../interfaces/enums';
import { StreamingConversationState } from '../../types';

export interface FeedAnalyticsPanelProps {
    viewMode: ViewMode;
    logFilter: LogFilter;
    hasInvalidLogs: boolean;
    showLatestOnly: boolean;
    feedPageSize: number;
    feedDisplayMode: FeedDisplayMode;
    onViewModeChange: (mode: ViewMode) => void;
    onLogFilterChange: (filter: LogFilter) => void;
    onShowLatestOnlyChange: (value: boolean) => void;
    onFeedPageSizeChange: (size: number) => void;
    onFeedDisplayModeChange: (mode: FeedDisplayMode) => void;
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
    isLoading?: boolean;
    // Inline editing props
    editingField?: { itemId: string; field: LogFeedRewriteTarget; originalValue: string } | null;
    editValue?: string;
    onStartEditing?: (itemId: string, field: LogFeedRewriteTarget, currentValue: string) => void;
    onSaveEditing?: () => void;
    onCancelEditing?: () => void;
    onEditValueChange?: (value: string) => void;
    // Rewriting props
    rewritingField?: { itemId: string; field: LogFeedRewriteTarget } | null;
    streamingContent?: string;
    onRewrite?: (itemId: string, field: LogFeedRewriteTarget) => void;
    // Score change prop
    onScoreChange?: (itemId: string, score: number) => void;
}

export default function FeedAnalyticsPanel({
    viewMode,
    logFilter,
    hasInvalidLogs,
    showLatestOnly,
    feedPageSize,
    feedDisplayMode,
    onViewModeChange,
    onLogFilterChange,
    onShowLatestOnlyChange,
    onFeedPageSizeChange,
    onFeedDisplayModeChange,
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
    streamingVersion,
    isLoading,
    editingField,
    editValue,
    onStartEditing,
    onSaveEditing,
    onCancelEditing,
    onEditValueChange,
    rewritingField,
    streamingContent,
    onRewrite,
    onScoreChange
}: FeedAnalyticsPanelProps) {
    return (
        <div className="lg:col-span-8 p-4 pb-8">
            <FeedControlBar
                viewMode={viewMode}
                logFilter={logFilter}
                hasInvalidLogs={hasInvalidLogs}
                showLatestOnly={showLatestOnly}
                feedPageSize={feedPageSize}
                feedDisplayMode={feedDisplayMode}
                onViewModeChange={onViewModeChange}
                onLogFilterChange={onLogFilterChange}
                onShowLatestOnlyChange={onShowLatestOnlyChange}
                onFeedPageSizeChange={onFeedPageSizeChange}
                onFeedDisplayModeChange={onFeedDisplayModeChange}
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
                    isLoading={isLoading}
                    displayMode={feedDisplayMode}
                    editingField={editingField}
                    editValue={editValue}
                    onStartEditing={onStartEditing}
                    onSaveEditing={onSaveEditing}
                    onCancelEditing={onCancelEditing}
                    onEditValueChange={onEditValueChange}
                    rewritingField={rewritingField}
                    streamingContent={streamingContent}
                    onRewrite={onRewrite}
                    onScoreChange={onScoreChange}
                />
            ) : (
                <AnalyticsDashboard logs={logs} />
            )}
        </div>
    );
}
