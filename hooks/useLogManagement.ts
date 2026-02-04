import { useState, useRef, useCallback, useEffect } from 'react';
import { LogStorageService } from '../services/logStorageService';
import * as FirebaseService from '../services/firebaseService';
import { SynthLogItem } from '../types';
import { Environment, LogFilter, LogItemStatus } from '../interfaces/enums';
import { logger } from '../utils/logger';

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
  isLoading: boolean;

  // Actions
  setCurrentPage: (page: number) => void;
  setLogFilter: (filter: LogFilter) => void;
  setShowLatestOnly: (show: boolean) => void;
  setFeedPageSize: (size: number) => void;
  setVisibleLogs: (logs: SynthLogItem[] | ((prev: SynthLogItem[]) => SynthLogItem[])) => void;
  setTotalLogCount: (count: number | ((prev: number) => number)) => void;
  setFilteredLogCount: (count: number | ((prev: number) => number)) => void;
  setLogsTrigger: (fn: (prev: number) => number) => void;
  refreshLogs: () => Promise<void>;
  handlePageChange: (page: number) => void;
  handleDeleteLog: (id: string) => Promise<void>;
  updateLog: (id: string, updates: Partial<SynthLogItem>) => void;
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
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const sessionUidRef = useRef(sessionUid);
  const totalLogCountRef = useRef(totalLogCount);
  const isDeletingRef = useRef(false);
  const prefetchedPageRef = useRef<{
    page: number;
    sessionUid: string;
    filter: LogFilter;
    pageSize: number;
    logs: SynthLogItem[];
    filteredCount: number;
  } | null>(null);

  // Keep totalLogCountRef in sync
  useEffect(() => {
    totalLogCountRef.current = totalLogCount;
  }, [totalLogCount]);
  
  // Keep sessionUidRef in sync
  useEffect(() => {
    sessionUidRef.current = sessionUid;
  }, [sessionUid]);
  
  // Check if a log is invalid
  const isInvalidLog = useCallback((log: SynthLogItem): boolean => {
    return log.status === LogItemStatus.TIMEOUT || log.status === LogItemStatus.ERROR || !!log.isError;
  }, []);
  
  // Fetch logs from Firebase with pagination support
  const fetchLogsFromFirebase = useCallback(async (
    sessionId: string,
    page: number,
    pageSize: number,
    filter: LogFilter
  ): Promise<{ logs: SynthLogItem[]; totalCount: number; filteredCount: number }> => {
    if (!FirebaseService.isFirebaseConfigured()) {
      return { logs: [], totalCount: 0, filteredCount: 0 };
    }

    try {
      // Fetch logs from Firebase - note: fetchLogsAfter returns all logs for now
      // We'll do client-side pagination for simplicity
      const allLogs = await FirebaseService.fetchAllLogs(undefined, sessionId);

      // Filter by status
      const isInvalid = (log: SynthLogItem) =>
        log.status === LogItemStatus.TIMEOUT || log.status === LogItemStatus.ERROR || (log as any).isError;
      const filteredLogs = filter === LogFilter.Invalid
        ? allLogs.filter(isInvalid)
        : allLogs.filter(l => !isInvalid(l));

      // Sort by timestamp desc (newest first)
      filteredLogs.sort((a, b) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
      );

      // Paginate
      const start = (page - 1) * pageSize;
      const paginatedLogs = filteredLogs.slice(start, start + pageSize);

      // Mark all logs fetched from Firebase as already saved (they came from cloud)
      const logsWithSavedFlag = paginatedLogs.map(log => ({
        ...log,
        savedToDb: true
      }));

      return {
        logs: logsWithSavedFlag as SynthLogItem[],
        totalCount: allLogs.length,
        filteredCount: filteredLogs.length
      };
    } catch (e) {
      console.error('Failed to fetch logs from Firebase:', e);
      return { logs: [], totalCount: 0, filteredCount: 0 };
    }
  }, []);

  // Refresh logs from storage (environment-aware)
  const refreshLogs = useCallback(async () => {
    // Skip refresh if a delete operation is in progress
    if (isDeletingRef.current) {
      return;
    }

    // Skip loading if no session is selected
    if (!sessionUid) {
      logger.log('[LogLoad] skip refresh: no session selected');
      setVisibleLogs([]);
      setTotalLogCount(0);
      setFilteredLogCount(0);
      setHasInvalidLogs(false);
      setIsLoading(false);
      return;
    }

    // Use ref for mid-generation updates when sessionUid might have just been set
    const currentSessionId = sessionUidRef.current || sessionUid;
    logger.log('[LogLoad] refresh start', {
      sessionUid: currentSessionId,
      environment,
      page: currentPage,
      pageSize: feedPageSize,
      filter: logFilter,
      showLatestOnly
    });

    const effectivePageSize = feedPageSize === -1 ? Number.MAX_SAFE_INTEGER : feedPageSize;
    const prefetched = prefetchedPageRef.current;

    const shouldUsePrefetch = prefetched
      && prefetched.page === currentPage
      && prefetched.sessionUid === currentSessionId
      && prefetched.filter === logFilter
      && prefetched.pageSize === effectivePageSize;

    // Only show loading spinner if not using prefetch cache
    if (!shouldUsePrefetch) {
      setIsLoading(true);
    }

    try {
      let result: { logs: SynthLogItem[]; totalCount: number; filteredCount: number };

      if (shouldUsePrefetch) {
        result = { logs: prefetched.logs, totalCount: totalLogCountRef.current, filteredCount: prefetched.filteredCount };
        logger.log('[LogLoad] using prefetched page', {
          sessionUid: currentSessionId,
          page: currentPage,
          logs: result.logs.length,
          filteredCount: result.filteredCount
        });
      } else if (environment === Environment.Production && FirebaseService.isFirebaseConfigured()) {
        // Production: Fetch from Firebase
        result = await fetchLogsFromFirebase(currentSessionId, currentPage, effectivePageSize, logFilter);
        logger.log('[LogLoad] loaded from firebase', {
          sessionUid: currentSessionId,
          page: currentPage,
          requestedPageSize: effectivePageSize,
          logs: result.logs.length,
          totalCount: result.totalCount,
          filteredCount: result.filteredCount
        });
      } else {
        // Development: Fetch from local IndexedDB
        result = await LogStorageService.getLogsPage(
          currentSessionId,
          currentPage,
          effectivePageSize,
          logFilter
        );
        logger.log('[LogLoad] loaded from local indexeddb', {
          sessionUid: currentSessionId,
          page: currentPage,
          requestedPageSize: effectivePageSize,
          logs: result.logs.length,
          totalCount: result.totalCount,
          filteredCount: result.filteredCount,
          sampleStatuses: result.logs.slice(0, 5).map((item) => ({
            id: item.id,
            status: item.status,
            isError: !!item.isError
          }))
        });
      }

      setVisibleLogs(result.logs);
      const nextTotal = shouldUsePrefetch
        ? (totalLogCountRef.current || result.totalCount)
        : result.totalCount;
      setTotalLogCount(nextTotal);
      setFilteredLogCount(result.filteredCount);

      // Check if there are any invalid logs
      let hasInvalid = false;
      if (environment === Environment.Production && FirebaseService.isFirebaseConfigured()) {
        const invalidResult = await fetchLogsFromFirebase(currentSessionId, 1, 1, LogFilter.Invalid);
        hasInvalid = invalidResult.filteredCount > 0;
        logger.log('[LogLoad] invalid check (firebase)', {
          sessionUid: currentSessionId,
          invalidCount: invalidResult.filteredCount
        });
      } else {
        const invalidResult = await LogStorageService.getLogsPage(
          currentSessionId,
          1,
          1,
          LogFilter.Invalid
        );
        hasInvalid = invalidResult.filteredCount > 0;
        logger.log('[LogLoad] invalid check (indexeddb)', {
          sessionUid: currentSessionId,
          invalidCount: invalidResult.filteredCount
        });
      }
      setHasInvalidLogs(hasInvalid);

      // If current filter is Live but session only has invalid items, switch to Invalid automatically.
      // This prevents "empty session" confusion when the session is actually populated.
      if (
        logFilter === LogFilter.Live &&
        result.filteredCount === 0 &&
        result.totalCount > 0 &&
        hasInvalid
      ) {
        logger.log('[LogLoad] auto-switching filter Live -> Invalid', {
          sessionUid: currentSessionId,
          totalCount: result.totalCount
        });
        setLogFilter(LogFilter.Invalid);
        return;
      }

      // Prefetch next page (only for local storage to avoid excessive Firebase reads)
      if (feedPageSize !== -1 && !showLatestOnly && environment === Environment.Development) {
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
    } finally {
      logger.log('[LogLoad] refresh end', {
        sessionUid: currentSessionId,
        totalLogCount: totalLogCountRef.current
      });
      setIsLoading(false);
    }
  }, [currentPage, feedPageSize, logFilter, logsTrigger, isInvalidLog, showLatestOnly, environment, fetchLogsFromFirebase, sessionUid]);
  
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
  }, [sessionUid, logFilter, feedPageSize, showLatestOnly, environment]);
  
  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);
  
  // Handle delete log
  const handleDeleteLog = useCallback(async (id: string) => {
    const logItem = visibleLogs.find(l => l.id === id);
    if (logItem) {
      // Set deleting flag to prevent refresh during delete
      isDeletingRef.current = true;

      try {
        // Delete from UI immediately
        setVisibleLogs(prev => prev.filter(l => l.id !== id));
        setTotalLogCount(prev => Math.max(0, prev - 1));
        setFilteredLogCount(prev => Math.max(0, prev - 1));

        // Delete from Local Storage
        await LogStorageService.deleteLog(sessionUid, id);

        // Delete from backend/Firebase if in Production and saved
        if (environment === Environment.Production && logItem.savedToDb) {
          try {
            await FirebaseService.deleteLogItem(id);
          } catch (e) {
            console.error("Failed to delete log from Firebase:", e);
          }
        }
      } finally {
        // Clear deleting flag
        isDeletingRef.current = false;
      }
    }
  }, [visibleLogs, sessionUid, environment]);
  
  // Update a specific log
  const updateLog = useCallback((id: string, updates: Partial<SynthLogItem>) => {
    setVisibleLogs(prev => prev.map(log =>
      log.id === id ? { ...log, ...updates } : log
    ));
  }, []);

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
    isLoading,
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
    updateLog,
    isInvalidLog,
    getUnsavedCount,
    triggerRefresh
  };
}
