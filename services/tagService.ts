import { SessionTag } from '../interfaces/services/SessionConfig';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

export const tagService = {
    async listTags(): Promise<SessionTag[]> {
        const response = await fetch(`${API_BASE_URL}/api/tags`);
        if (!response.ok) {
            throw new Error(`Failed to fetch tags: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    },

    async createTag(name: string): Promise<SessionTag> {
        const response = await fetch(`${API_BASE_URL}/api/tags`, {
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
        const response = await fetch(`${API_BASE_URL}/api/tags/${uid}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`Failed to delete tag: ${response.statusText}`);
        }
    },

    async getSessionTags(sessionUid: string): Promise<SessionTag[]> {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionUid}/tags`);
        if (!response.ok) {
            throw new Error(`Failed to fetch session tags: ${response.statusText}`);
        }
        const data = await response.json();
        return data.tags || [];
    },

    async addTagsToSession(sessionUid: string, tagUids: string[]): Promise<SessionTag[]> {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionUid}/tags`, {
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
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionUid}/tags`, {
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
