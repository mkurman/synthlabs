import { SessionTag } from '../interfaces/services/SessionConfig';
import { getBackendUrl } from './backendClient';

const buildUrl = async (path: string): Promise<string> => {
    const base = await getBackendUrl();
    if (!base) throw new Error('Backend URL is not configured.');
    return `${base.replace(/\/+$/, '')}${path}`;
};

export const tagService = {
    async listTags(): Promise<SessionTag[]> {
        const url = await buildUrl('/api/tags');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch tags: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    },

    async createTag(name: string): Promise<SessionTag> {
        const url = await buildUrl('/api/tags');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!response.ok) {
            if (response.status === 409) {
                const data = await response.json();
                return data.tag;
            }
            throw new Error(`Failed to create tag: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tag;
    },

    async deleteTag(uid: string): Promise<void> {
        const url = await buildUrl(`/api/tags/${uid}`);
        const response = await fetch(url, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete tag: ${response.statusText}`);
        }
    },

    async getSessionTags(sessionUid: string): Promise<SessionTag[]> {
        const url = await buildUrl(`/api/sessions/${sessionUid}/tags`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch session tags: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    },

    async addTagsToSession(sessionUid: string, tagUids: string[]): Promise<SessionTag[]> {
        const url = await buildUrl(`/api/sessions/${sessionUid}/tags`);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagUids })
        });
        if (!response.ok) {
            throw new Error(`Failed to add tags to session: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    },

    async removeTagsFromSession(sessionUid: string, tagUids: string[]): Promise<SessionTag[]> {
        const url = await buildUrl(`/api/sessions/${sessionUid}/tags`);
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagUids })
        });
        if (!response.ok) {
            throw new Error(`Failed to remove tags from session: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    }
};

export default tagService;
