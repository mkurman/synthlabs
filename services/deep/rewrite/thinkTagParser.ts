import { logger } from '../../../utils/logger';

export interface ThinkTagParseResult {
  originalThinking: string;
  outsideThinkContent: string;
  isImputation: boolean;
}

const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/i;

export function parseThinkTags(content: string, messageIndex: number, reasoningContent?: string): ThinkTagParseResult {
  const thinkMatch = content.match(THINK_TAG_REGEX);
  let originalThinking = "";
  let outsideThinkContent = content;
  let isImputation = false;

  if (!thinkMatch) {
    if (reasoningContent) {
      originalThinking = reasoningContent.trim();
      outsideThinkContent = content.trim();
      logger.log(`Message ${messageIndex}: Using reasoning_content field for original thinking.`);
    } else {
      isImputation = true;
      logger.log(`Message ${messageIndex}: No think tags found. Switching to IMPUTATION mode.`);
      outsideThinkContent = content.trim();
    }
  } else {
    originalThinking = thinkMatch[1].trim();
    outsideThinkContent = content.replace(THINK_TAG_REGEX, '').trim();
    logger.log(`Message ${messageIndex}: Rewriting think content (${originalThinking.length} chars)`);
  }

  return { originalThinking, outsideThinkContent, isImputation };
}
