const WRAPPER_PATTERNS = [
    /^<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>$/i,
    /^<\s*reasoning_content\s*>([\s\S]*?)<\s*\/\s*reasoning_content\s*>$/i,
    /^<\s*reasoning\s*>([\s\S]*?)<\s*\/\s*reasoning\s*>$/i,
    /^<\s*reasoning_trace\s*>([\s\S]*?)<\s*\/\s*reasoning_trace\s*>$/i,
    /^<\s*tool_call\s*>([\s\S]*?)<\s*\/\s*tool_call\s*>$/i,
];

const stripCodeFence = (value) =>
    String(value || '')
        .replace(/^```(?:json|xml|txt|markdown)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

export const sanitizeReasoningContent = (value) => {
    let text = stripCodeFence(value);
    if (!text) return '';

    // Unwrap known outer wrappers repeatedly (but keep inner trace text).
    for (let i = 0; i < 8; i += 1) {
        const prev = text;
        for (const pattern of WRAPPER_PATTERNS) {
            const match = text.match(pattern);
            if (match && typeof match[1] === 'string') {
                text = match[1].trim();
            }
        }
        if (prev === text) break;
    }

    // Remove dangling wrapper tags only at boundaries.
    text = text
        .replace(/^<\s*\/?\s*(?:think|reasoning_content|reasoning|reasoning_trace|tool_call)\s*>/i, '')
        .replace(/<\s*\/\s*(?:think|reasoning_content|reasoning|reasoning_trace|tool_call)\s*>$/i, '')
        .trim();

    return text;
};

export const sanitizeLogReasoningContent = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const next = { ...payload };

    if (typeof next.reasoning_content === 'string') {
        next.reasoning_content = sanitizeReasoningContent(next.reasoning_content);
    }

    if (Array.isArray(next.messages)) {
        next.messages = next.messages.map((msg) => {
            if (!msg || typeof msg !== 'object') return msg;
            if (typeof msg.reasoning_content !== 'string') return msg;
            return {
                ...msg,
                reasoning_content: sanitizeReasoningContent(msg.reasoning_content),
            };
        });
    }

    return next;
};

