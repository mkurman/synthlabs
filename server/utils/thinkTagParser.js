const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/i;
const TOOL_CALL_TAG_REGEX = /<tool_call>[\s\S]*?<\/tool_call>/gi;

const sanitizeCodeFences = (text) =>
  text
    .replace(/^```(?:json|xml|txt)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const normalizeContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

export function sanitizeReasoningContent(content) {
  let text = sanitizeCodeFences(normalizeContent(content)).trim();
  if (!text) return '';

  text = text.replace(TOOL_CALL_TAG_REGEX, '').trim();

  const wrappers = [
    /^<\s*think\s*>([\s\S]*?)<\s*\/\s*think\s*>$/i,
    /^<\s*reasoning_content\s*>([\s\S]*?)<\s*\/\s*reasoning_content\s*>$/i,
    /^<\s*reasoning\s*>([\s\S]*?)<\s*\/\s*reasoning\s*>$/i,
    /^<\s*REASONING_TRACE\s*>([\s\S]*?)<\s*\/\s*REASONING_TRACE\s*>$/i,
  ];
  for (let i = 0; i < 8; i += 1) {
    const previous = text;
    for (const wrapper of wrappers) {
      const match = text.match(wrapper);
      if (match?.[1] !== undefined) {
        text = match[1].trim();
      }
    }
    if (text === previous) break;
  }

  text = text
    .replace(/^<\s*\/?\s*(?:think|reasoning_content|reasoning|REASONING_TRACE)\s*>/i, '')
    .replace(/<\s*\/\s*(?:think|reasoning_content|reasoning|REASONING_TRACE)\s*>$/i, '')
    .trim();

  return text;
}

export function parseThinkTagsForDisplay(content) {
  const normalizedContent = normalizeContent(content);
  const thinkMatch = normalizedContent.match(THINK_TAG_REGEX);
  if (!thinkMatch) {
    return { reasoning: null, answer: normalizedContent, hasThinkTags: false };
  }

  const reasoning = thinkMatch[1]?.trim() ?? '';
  const answer = normalizedContent.replace(THINK_TAG_REGEX, '').trim();

  return { reasoning, answer, hasThinkTags: true };
}

export function extractMessageParts(message) {
  const parsed = parseThinkTagsForDisplay(message.content);
  const cleanContent = parsed.answer;

  const reasoning =
    message.reasoning_content?.trim() ||
    parsed.reasoning?.trim() ||
    message.reasoning?.trim() ||
    '';

  return { reasoning: sanitizeReasoningContent(reasoning), content: cleanContent };
}
