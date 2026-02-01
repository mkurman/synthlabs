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

export function parseThinkTagsForDisplay(content: string): ThinkTagDisplayResult {
  const thinkMatch = content.match(THINK_TAG_REGEX);
  if (!thinkMatch) {
    return { reasoning: null, answer: content, hasThinkTags: false };
  }

  const reasoning = thinkMatch[1]?.trim() ?? '';
  const answer = content.replace(THINK_TAG_REGEX, '').trim();

  return { reasoning, answer, hasThinkTags: true };
}

export function parseNativeOutput(content: string): NativeOutputParseResult {
  const parsed = parseThinkTagsForDisplay(content || '');
  const reasoning = parsed.reasoning || '';
  const answer = parsed.hasThinkTags ? parsed.answer : content;
  return {
    reasoning,
    reasoning_content: reasoning,
    answer: answer || ''
  };
}
