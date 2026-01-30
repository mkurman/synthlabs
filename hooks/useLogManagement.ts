import { useState, useRef, useCallback, useEffect } from 'react';
import { LogStorageService } from '../services/logStorageService';
import * as FirebaseService from '../services/firebaseService';
import { SynthLogItem } from '../types';
import { Environment, LogFilter, LogItemStatus } from '../interfaces/enums';

interface UseLogManagementProps {
  sessionUid: string;
  environment: Environment;
}

interface UseLogManagementReturn {
  // State
  visibleLogs: SynthLogItem[];
  totalLogCount: number;
  filteredLogCount: number;
  hasInvalidLogs: boolean;
  currentPage: number;
  logFilter: LogFilter;
  showLatestOnly: boolean;
  feedPageSize: number;
  
  // Actions
  setCurrentPage: (page: number) => void;
  setLogFilter: (filter: LogFilter) => void;
  setShowLatestOnly: (show: boolean) => void;
  setFeedPageSize: (size: number) => void;
  setVisibleLogs: (logs: SynthLogItem[]) => void;
  setTotalLogCount: (count: number) => void;
  setFilteredLogCount: (count: number) => void;
  setLogsTrigger: (fn: (prev: number) => number) => void;
  refreshLogs: () => Promise<void>;
  handlePageChange: (page: number) => void;
  handleDeleteLog: (id: string) => Promise<void>;
  isInvalidLog: (log: SynthLogItem) => boolean;
  getUnsavedCount: () => number;
  triggerRefresh: () => void;
}

export function useLogManagement({ sessionUid, environment }: UseLogManagementProps): UseLogManagementReturn {
  // State
  const [visibleLogs, setVisibleLogs] = useState<SynthLogItem[]>([]);
  const [totalLogCount, setTotalLogCount] = useState(0);
  const [filteredLogCount, setFilteredLogCount] = useState(0);
  const [hasInvalidLogs, setHasInvalidLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [logFilter, setLogFilter] = useState<LogFilter>(LogFilter.Live);
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [feedPageSize, setFeedPageSize] = useState<number>(25);
  const [logsTrigger, setLogsTrigger] = useState(0);
  
  // Refs
  const sessionUidRef = useRef(sessionUid);
  const prefetchedPageRef = useRef<{
    page: number;
    sessionUid: string;
    filter: LogFilter;
    pageSize: number;
    logs: SynthLogItem[];
    filteredCount: number;
  } | null>(null);
  
  // Keep sessionUidRef in sync
  useEffect(() => {
    sessionUidRef.current = sessionUid;
  }, [sessionUid]);
  
  // Check if a log is invalid
  const isInvalidLog = useCallback((log: SynthLogItem): boolean => {
    return log.status === LogItemStatus.TIMEOUT || log.status === LogItemStatus.ERROR || !!log.isError;
  }, []);
  
  // Refresh logs from storage
  const refreshLogs = useCallback(async () => {
    const currentSessionId = sessionUidRef.current;
    const effectivePageSize = feedPageSize === -1 ? Number.MAX_SAFE_INTEGER : feedPageSize;
    const prefetched = prefetchedPageRef.current;
    
    const shouldUsePrefetch = prefetched
      && prefetched.page === currentPage
      && prefetched.sessionUid === currentSessionId
      && prefetched.filter === logFilter
      && prefetched.pageSize === effectivePageSize;
    
    const result = shouldUsePrefetch
      ? { logs: prefetched.logs, totalCount: totalLogCount, filteredCount: prefetched.filteredCount }
      : await LogStorageService.getLogsPage(
          currentSessionId,
          currentPage,
          effectivePageSize,
          logFilter
        );
    
    setVisibleLogs(result.logs);
    const nextTotal = shouldUsePrefetch
      ? (totalLogCount || result.totalCount)
      : result.totalCount;
    setTotalLogCount(nextTotal);
    setFilteredLogCount(result.filteredCount);
    
    // Check if there are any invalid logs
    const invalidResult = await LogStorageService.getLogsPage(
      currentSessionId,
      1,
      1,
      LogFilter.Invalid
    );
    setHasInvalidLogs(invalidResult.filteredCount > 0);
    
    // Prefetch next page
    if (feedPageSize !== -1 && !showLatestOnly) {
      const nextPage = currentPage + 1;
      LogStorageService.getLogsPage(currentSessionId, nextPage, effectivePageSize, logFilter)
        .then(nextResult => {
          prefetchedPageRef.current = {
            page: nextPage,
            sessionUid: currentSessionId,
            filter: logFilter,
            pageSize: effectivePageSize,
            logs: nextResult.logs,
            filteredCount: nextResult.filteredCount
          };
        })
        .catch(() => {
          prefetchedPageRef.current = null;
        });
    } else {
      prefetchedPageRef.current = null;
    }
  }, [currentPage, feedPageSize, logFilter, logsTrigger, totalLogCount, isInvalidLog, showLatestOnly]);
  
  // Initial load and refresh trigger
  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);
  
  // Reset to page 1 on session switch
  useEffect(() => {
    setCurrentPage(1);
  }, [sessionUid]);
  
  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [logFilter]);
  
  // Clear prefetch cache when relevant params change
  useEffect(() => {
    prefetchedPageRef.current = null;
  }, [sessionUid, logFilter, feedPageSize, showLatestOnly]);
  
  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);
  
  // Handle delete log
  const handleDeleteLog = useCallback(async (id: string) => {
    const logItem = visibleLogs.find(l => l.id === id);
    if (logItem) {
      // Delete from UI immediately
      setVisibleLogs(prev => prev.filter(l => l.id !== id));
      setTotalLogCount(prev => Math.max(0, prev - 1));
      setFilteredLogCount(prev => Math.max(0, prev - 1));
      
      // Delete from Local Storage
      await LogStorageService.deleteLog(sessionUid, id);
      
      // Delete from Firebase if in Production and Saved
      if (environment === Environment.Production && FirebaseService.isFirebaseConfigured() && logItem.savedToDb) {
        try {
          await FirebaseService.deleteLogItem(id);
        } catch (e) {
          console.error("Failed to delete log from Firebase:", e);
        }
      }
    }
  }, [visibleLogs, sessionUid, environment]);
  
  // Get count of unsaved items
  const getUnsavedCount = useCallback(() => {
    return visibleLogs.filter((l: SynthLogItem) => !l.savedToDb && !isInvalidLog(l)).length;
  }, [visibleLogs, isInvalidLog]);
  
  // Trigger a refresh manually
  const triggerRefresh = useCallback(() => {
    setLogsTrigger(prev => prev + 1);
  }, []);
  
  return {
    visibleLogs,
    totalLogCount,
    filteredLogCount,
    hasInvalidLogs,
    currentPage,
    logFilter,
    showLatestOnly,
    feedPageSize,
    setCurrentPage,
    setLogFilter,
    setShowLatestOnly,
    setFeedPageSize,
    setVisibleLogs,
    setTotalLogCount,
    setFilteredLogCount,
    setLogsTrigger,
    refreshLogs,
    handlePageChange,
    handleDeleteLog,
    isInvalidLog,
    getUnsavedCount,
    triggerRefresh
  };
}
