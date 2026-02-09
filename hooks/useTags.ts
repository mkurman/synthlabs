import { useState, useEffect, useCallback } from 'react';
import { SessionTag } from '../interfaces/services/SessionConfig';
import { tagService } from '../services/tagService';

export function useTags() {
    const [tags, setTags] = useState<SessionTag[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTags = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedTags = await tagService.listTags();
            setTags(fetchedTags);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch tags');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createTag = useCallback(async (name: string): Promise<SessionTag | null> => {
        try {
            const newTag = await tagService.createTag(name);
            setTags(prev => [...prev, newTag]);
            return newTag;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create tag');
            return null;
        }
    }, []);

    const deleteTag = useCallback(async (uid: string) => {
        try {
            await tagService.deleteTag(uid);
            setTags(prev => prev.filter(t => t.uid !== uid));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete tag');
        }
    }, []);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    return {
        tags,
        isLoading,
        error,
        fetchTags,
        createTag,
        deleteTag
    };
}

export default useTags;
