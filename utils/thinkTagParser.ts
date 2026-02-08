const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/i;
const TOOL_CALL_TAG_REGEX = /<tool_call>[\s\S]*?<\/tool_call>/gi;

const sanitizeCodeFences = (text: string): string =>
  text
    .replace(/^```(?:json|xml|txt)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

export function sanitizeReasoningContent(content: unknown): string {
  let text = sanitizeCodeFences(normalizeContent(content)).trim();
  if (!text) return '';

  // Tool calls are never part of reasoning content.
  text = text.replace(TOOL_CALL_TAG_REGEX, '').trim();

  // Repeatedly unwrap known outer wrappers (<think>, <reasoning_content>, <reasoning>, <REASONING_TRACE>).
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

  // Clean leftover dangling wrapper tags at start/end.
  text = text
    .replace(/^<\s*\/?\s*(?:think|reasoning_content|reasoning|REASONING_TRACE)\s*>/i, '')
    .replace(/<\s*\/\s*(?:think|reasoning_content|reasoning|REASONING_TRACE)\s*>$/i, '')
    .trim();

  return text;
}

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
  const reasoning = sanitizeReasoningContent(parsed.reasoning || '');
  const answer = parsed.hasThinkTags ? parsed.answer : normalizedContent;
  return {
    reasoning,
    reasoning_content: reasoning,
    answer: answer || ''
  };
}

export interface MessageParts {
  /** The reasoning content (without <think> tags) */
  reasoning: string;
  /** The clean content (with <think> tags stripped) */
  content: string;
}

/**
 * Extracts reasoning and clean content from a message object.
 *
 * Priority chain for reasoning:
 *   1. message.reasoning_content (dedicated field, no <think> tags)
 *   2. <think> tags inside message.content
 *   3. message.reasoning (deprecated field)
 *
 * The returned `content` always has <think> tags stripped.
 */
export function extractMessageParts(message: {
  content: string;
  reasoning_content?: string;
  reasoning?: string;
}): MessageParts {
  // Always strip <think> tags from content to get the clean answer
  const parsed = parseThinkTagsForDisplay(message.content);
  const cleanContent = parsed.answer;

  // Resolve reasoning with priority: reasoning_content > <think> tags > reasoning
  const reasoning =
    message.reasoning_content?.trim() ||
    parsed.reasoning?.trim() ||
    message.reasoning?.trim() ||
    '';

  return { reasoning: sanitizeReasoningContent(reasoning), content: cleanContent };
}
