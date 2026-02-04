const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/i;

export interface ThinkTagDisplayResult {
  reasoning: string | null;
  answer: string;
  hasThinkTags: boolean;
}

export interface NativeOutputParseResult {
  reasoning: string;
  reasoning_content: string;
  answer: string;
}

const normalizeContent = (content: unknown): string => {
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

export function parseThinkTagsForDisplay(content: unknown): ThinkTagDisplayResult {
  const normalizedContent = normalizeContent(content);
  const thinkMatch = normalizedContent.match(THINK_TAG_REGEX);
  if (!thinkMatch) {
    return { reasoning: null, answer: normalizedContent, hasThinkTags: false };
  }

  const reasoning = thinkMatch[1]?.trim() ?? '';
  const answer = normalizedContent.replace(THINK_TAG_REGEX, '').trim();

  return { reasoning, answer, hasThinkTags: true };
}

export function parseNativeOutput(content: unknown): NativeOutputParseResult {
  const normalizedContent = normalizeContent(content);
  const parsed = parseThinkTagsForDisplay(normalizedContent);
  const reasoning = parsed.reasoning || '';
  const answer = parsed.hasThinkTags ? parsed.answer : normalizedContent;
  return {
    reasoning,
    reasoning_content: reasoning,
    answer: answer || ''
  };
}
