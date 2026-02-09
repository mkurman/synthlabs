import { randomUUID } from 'crypto';

export const generateUid = () => {
    return randomUUID();
};

export const isValidUid = (uid) => {
    if (!uid || typeof uid !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uid);
};
