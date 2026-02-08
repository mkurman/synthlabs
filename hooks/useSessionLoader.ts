import { useState, useCallback, useEffect, useRef } from 'react';
import { PaginatedItems } from '../types';
import * as IndexedDBUtils from '../services/session/indexedDBUtils';

interface UseSessionLoaderOptions {
    sessionId: string | null;
    pageSize?: number;
    prefetchPageCount?: number;
    enabled?: boolean;
}

/**
 * Hook for lazy loading session items with pagination and prefetching
 */
export function useSessionLoader<T>(options: UseSessionLoaderOptions) {
    const {
        sessionId,
        pageSize = 50,
        prefetchPageCount = 2,
        enabled = true
    } = options;

    const [items, setItems] = useState<T[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    // Cache for prefetched pages
    const pageCache = useRef<Map<number, T[]>>(new Map());
    const loadingPages = useRef<Set<number>>(new Set());

    /**
     * Load a specific page
     */
    const loadPage = useCallback(async (page: number): Promise<T[]> => {
        if (!sessionId || !enabled) return [];

        // Check cache first
        if (pageCache.current.has(page)) {
            return pageCache.current.get(page)!;
        }

        // Prevent duplicate loads
        if (loadingPages.current.has(page)) {
            // Wait for the ongoing load
            return new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (pageCache.current.has(page)) {
                        clearInterval(interval);
                        resolve(pageCache.current.get(page)!);
                    }
                }, 100);
            });
        }

        loadingPages.current.add(page);

        try {
            const result = await IndexedDBUtils.loadItems(sessionId, page, pageSize);

            // Cache the result
            pageCache.current.set(page, result.items as T[]);
            loadingPages.current.delete(page);

            return result.items as T[];
        } catch (error) {
            console.error(`Failed to load page ${page}:`, error);
            loadingPages.current.delete(page);
            return [];
        }
    }, [sessionId, pageSize, enabled]);

    /**
     * Prefetch upcoming pages
     */
    const prefetchUpcomingPages = useCallback(async (startPage: number) => {
        if (!sessionId || !enabled) return;

        const pagesToPrefetch = [];
        for (let i = 1; i <= prefetchPageCount; i++) {
            const page = startPage + i;
            if (!pageCache.current.has(page) && !loadingPages.current.has(page)) {
                pagesToPrefetch.push(page);
            }
        }

        // Prefetch in parallel
        await Promise.all(pagesToPrefetch.map(page => loadPage(page)));
    }, [sessionId, enabled, prefetchPageCount, loadPage]);

    /**
     * Load initial page and metadata
     */
    const loadInitial = useCallback(async () => {
        if (!sessionId || !enabled) return;

        setIsLoading(true);
        try {
            // Load first page and get total count
            const result = await IndexedDBUtils.loadItems(sessionId, 0, pageSize);

            setItems(result.items as T[]);
            setTotalCount(result.totalCount);
            setCurrentPage(0);
            setHasMore(result.totalCount > pageSize);

            // Cache first page
            pageCache.current.clear();
            pageCache.current.set(0, result.items as T[]);

            // Prefetch next pages
            if (result.totalCount > pageSize) {
                prefetchUpcomingPages(0);
            }
        } catch (error) {
            console.error('Failed to load initial items:', error);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, pageSize, enabled, prefetchUpcomingPages]);

    /**
     * Load next page
     */
    const loadNextPage = useCallback(async () => {
        if (!sessionId || !enabled || !hasMore || isLoading) return;

        setIsLoading(true);
        try {
            const nextPage = currentPage + 1;
            const pageItems = await loadPage(nextPage);

            setItems(prev => [...prev, ...pageItems]);
            setCurrentPage(nextPage);
            setHasMore((nextPage + 1) * pageSize < totalCount);

            // Prefetch more pages
            prefetchUpcomingPages(nextPage);
        } catch (error) {
            console.error('Failed to load next page:', error);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId, enabled, hasMore, isLoading, currentPage, pageSize, totalCount, loadPage, prefetchUpcomingPages]);

    /**
     * Reload all items (clear cache)
     */
    const reload = useCallback(async () => {
        pageCache.current.clear();
        loadingPages.current.clear();
        await loadInitial();
    }, [loadInitial]);

    /**
     * Add items to current session
     */
    const addItems = useCallback(async (newItems: T[]) => {
        if (!sessionId) return;

        try {
            await IndexedDBUtils.saveItems(sessionId, newItems);

            // Reload to refresh cache
            await reload();
        } catch (error) {
            console.error('Failed to add items:', error);
        }
    }, [sessionId, reload]);

    // Load initial items when session changes
    useEffect(() => {
        if (sessionId && enabled) {
            loadInitial();
        }
    }, [sessionId, enabled, loadInitial]);

    // Clear cache when session changes
    useEffect(() => {
        return () => {
            pageCache.current.clear();
            loadingPages.current.clear();
        };
    }, [sessionId]);

    return {
        // State
        items,
        totalCount,
        currentPage,
        isLoading,
        hasMore,
        pageSize,

        // Pagination
        paginatedItems: {
            items,
            totalCount,
            currentPage,
            pageSize,
            hasMore
        } as PaginatedItems<T>,

        // Actions
        loadNextPage,
        reload,
        addItems
    };
}
