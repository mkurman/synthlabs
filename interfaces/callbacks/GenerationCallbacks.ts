import { SynthLogItem } from '../../types';
import { TaskType } from '../enums/TaskType';
import { PrefetchState } from '../../services/hfPrefetchService';
import { DeepConfig } from '../../types';

export interface GenerationCallbacks {
    setError: (error: string | null) => void;
    setIsRunning: (running: boolean) => void;
    setProgress: (progress: { current: number; total: number; activeWorkers: number } | ((prev: { current: number; total: number; activeWorkers: number }) => { current: number; total: number; activeWorkers: number })) => void;
    setSessionUid: (uid: string) => void;
    setSessionName: (name: string | null) => void;
    setVisibleLogs: (logs: SynthLogItem[] | ((prev: SynthLogItem[]) => SynthLogItem[])) => void;
    setTotalLogCount: (count: number | ((prev: number) => number)) => void;
    setFilteredLogCount: (count: number | ((prev: number) => number)) => void;
    setSparklineHistory: (history: number[]) => void;
    setPrefetchState: (state: PrefetchState | null) => void;
    setDetectedTaskType: (type: TaskType | null) => void;
    setAutoRoutedPromptSet: (set: string | null) => void;
    setSystemPrompt: (prompt: string) => void;
    setConverterPrompt: (prompt: string) => void;
    setDeepConfig: (config: DeepConfig) => void;
    refreshLogs: () => void;
    updateDbStats: () => void;

    // Streaming UI callbacks
    scheduleStreamingUpdate: () => void;
    bumpStreamingConversations: () => void;

    // Logs trigger for UI updates
    setLogsTrigger: (fn: (prev: number) => number) => void;
}
