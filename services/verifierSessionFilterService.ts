export const resolveSessionFilter = (
    selectedSessionFilter: string,
    currentSessionUid: string,
    customSessionId: string
): { sessionUid?: string; requiresCustom: boolean } => {
    if (selectedSessionFilter === 'current') {
        return { sessionUid: currentSessionUid, requiresCustom: false };
    }

    if (selectedSessionFilter === 'custom') {
        const trimmed = customSessionId.trim();
        return { sessionUid: trimmed || undefined, requiresCustom: true };
    }

    if (selectedSessionFilter === 'all') {
        return { sessionUid: undefined, requiresCustom: false };
    }

    return { sessionUid: selectedSessionFilter, requiresCustom: false };
};

export default { resolveSessionFilter };
