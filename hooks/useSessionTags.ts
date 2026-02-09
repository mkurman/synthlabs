import { useState, useEffect, useCallback } from 'react';
import { SessionTag } from '../interfaces/services/SessionConfig';
import { tagService } from '../services/tagService';

export function useSessionTags(sessionUid: string | null) {
    const [tags, setTags] = useState<SessionTag[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSessionTags = useCallback(async () => {
        if (!sessionUid) {
            setTags([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const fetchedTags = await tagService.getSessionTags(sessionUid);
            setTags(fetchedTags);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch session tags');
        } finally {
            setIsLoading(false);
        }
    }, [sessionUid]);

    const addTags = useCallback(async (tagUids: string[]) => {
        if (!sessionUid) return;
        try {
            const updatedTags = await tagService.addTagsToSession(sessionUid, tagUids);
            setTags(updatedTags);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add tags');
        }
    }, [sessionUid]);

    const removeTags = useCallback(async (tagUids: string[]) => {
        if (!sessionUid) return;
        try {
            const updatedTags = await tagService.removeTagsFromSession(sessionUid, tagUids);
            setTags(updatedTags);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove tags');
        }
    }, [sessionUid]);

    useEffect(() => {
        fetchSessionTags();
    }, [fetchSessionTags]);

    return {
        tags,
        isLoading,
        error,
        fetchSessionTags,
        addTags,
        removeTags
    };
}

export default useSessionTags;
