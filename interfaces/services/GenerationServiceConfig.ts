/**
 * Generation Service Interfaces
 * 
 * Provides type definitions for generation operations, retry logic, and sync operations.
 */

import { SynthLogItem } from '../../types';
import { ConfirmVariant } from '../../services/confirmService';

/**
 * Status of a generation operation.
 */
export enum GenerationStatus {
    /** Initial state */
    Pending = 'pending',
    /** Currently generating */
    InProgress = 'in_progress',
    /** Successfully completed */
    Success = 'success',
    /** Failed with error */
    Error = 'error',
    /** Timed out */
    Timeout = 'timeout',
    /** Aborted by user */
    Aborted = 'aborted'
}

/**
 * Type of retry operation.
 */
export enum RetryType {
    /** Retry a single failed item */
    SingleItem = 'single_item',
    /** Retry saving to database */
    Save = 'save',
    /** Retry all failed items */
    AllFailed = 'all_failed'
}

/**
 * Configuration for retrying a single item.
 */
export interface RetryItemConfig {
    /** ID of the item to retry */
    id: string;
    /** Current session UID */
    sessionUid: string;
    /** Current environment */
    environment: string;
    /** Visible logs for finding the item */
    visibleLogs: SynthLogItem[];
    /** Function to generate a single item */
    generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>;
    /** Set retrying IDs state */
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void;
    /** Refresh logs view */
    refreshLogs: () => void;
    /** Update database stats */
    updateDbStats: () => void;
    /** Firebase service */
    firebaseService: {
        saveLogToFirebase: (log: SynthLogItem) => Promise<void>;
    };
    /** Log storage service */
    logStorageService: {
        updateLog: (sessionUid: string, log: SynthLogItem) => Promise<void>;
    };
}

/**
 * Configuration for retrying a save operation.
 */
export interface RetrySaveConfig {
    /** ID of the item to save */
    id: string;
    /** Current session UID */
    sessionUid: string;
    /** Visible logs for finding the item */
    visibleLogs: SynthLogItem[];
    /** Set retrying IDs state */
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void;
    /** Refresh logs view */
    refreshLogs: () => void;
    /** Update database stats */
    updateDbStats: () => void;
    /** Firebase service */
    firebaseService: {
        saveLogToFirebase: (log: SynthLogItem) => Promise<void>;
    };
    /** Log storage service */
    logStorageService: {
        updateLog: (sessionUid: string, log: SynthLogItem) => Promise<void>;
    };
}

/**
 * Configuration for retrying all failed items.
 */
export interface RetryAllFailedConfig {
    /** Current session UID */
    sessionUid: string;
    /** Current environment */
    environment: string;
    /** Concurrency limit */
    concurrency: number;
    /** Visible logs for finding failed items */
    visibleLogs: SynthLogItem[];
    /** Function to check if log is invalid */
    isInvalidLog: (log: SynthLogItem) => boolean;
    /** Set retrying IDs state */
    setRetryingIds: (fn: (prev: Set<string>) => Set<string>) => void;
    /** Function to generate a single item */
    generateSingleItem: (inputText: string, workerId: number, opts: any) => Promise<SynthLogItem | null>;
    /** Refresh logs view */
    refreshLogs: () => void;
    /** Firebase service */
    firebaseService: {
        saveLogToFirebase: (log: SynthLogItem) => Promise<void>;
    };
    /** Log storage service */
    logStorageService: {
        updateLog: (sessionUid: string, log: SynthLogItem) => Promise<void>;
    };
}

/**
 * Configuration for syncing unsaved items to database.
 */
export interface SyncUnsavedConfig {
    /** Current session UID */
    sessionUid: string;
    /** Function to check if log is invalid */
    isInvalidLog: (log: SynthLogItem) => boolean;
    /** Refresh logs view */
    refreshLogs: () => void;
    /** Update database stats */
    updateDbStats: () => void;
    /** Confirm service */
    confirmService: {
        alert: (options: { title: string; message: string; variant: ConfirmVariant }) => Promise<void>;
        confirm: (options: { title: string; message: string; confirmLabel: string; cancelLabel: string; variant: ConfirmVariant }) => Promise<boolean>;
    };
    /** Firebase service */
    firebaseService: {
        isFirebaseConfigured: () => boolean;
        saveLogToFirebase: (log: SynthLogItem) => Promise<void>;
    };
    /** Log storage service */
    logStorageService: {
        getAllLogs: (sessionUid: string) => Promise<SynthLogItem[]>;
        updateLog: (sessionUid: string, log: SynthLogItem) => Promise<void>;
    };
    /** Logger */
    logger: {
        warn: (message: string, ...args: any[]) => void;
    };
}

/**
 * Configuration for saving a single item to database.
 */
export interface SaveItemConfig {
    /** ID of the item to save */
    id: string;
    /** Current session UID */
    sessionUid: string;
    /** Visible logs for finding the item */
    visibleLogs: SynthLogItem[];
    /** Refresh logs view */
    refreshLogs: () => void;
    /** Update database stats */
    updateDbStats: () => void;
    /** Confirm service */
    confirmService: {
        alert: (options: { title: string; message: string; variant: ConfirmVariant }) => Promise<void>;
    };
    /** Firebase service */
    firebaseService: {
        isFirebaseConfigured: () => boolean;
        saveLogToFirebase: (log: SynthLogItem) => Promise<void>;
    };
    /** Log storage service */
    logStorageService: {
        updateLog: (sessionUid: string, log: SynthLogItem) => Promise<void>;
    };
}

/**
 * Result from a retry operation.
 */
export interface RetryResult {
    /** Whether the retry was successful */
    success: boolean;
    /** The retried item (if successful) */
    item?: SynthLogItem;
    /** Error message (if failed) */
    error?: string;
}

/**
 * Result from a sync operation.
 */
export interface SyncResult {
    /** Number of items successfully synced */
    synced: number;
    /** Number of items that failed to sync */
    failed: number;
    /** Total number of items attempted */
    total: number;
}
