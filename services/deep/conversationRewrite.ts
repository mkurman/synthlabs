import { DeepConfig, SynthLogItem, GenerationParams, ChatMessage, LogItemStatus, ProviderType, ChatRole, EngineMode, ExternalProvider } from '../../types';
import { PromptCategory, PromptRole } from '../../interfaces/enums';
import { logger } from '../../utils/logger';
import { executePhase } from './phaseExecutor';
import { orchestrateDeepReasoning } from './deepOrchestrator';
import * as GeminiService from '../geminiService';
import * as ExternalApiService from '../externalApiService';
import { SettingsService } from '../settingsService';
import { PromptService } from '../promptService';

export interface ConversationRewriteParams {
  messages: ChatMessage[];
  config: DeepConfig;
  engineMode: EngineMode;
  converterPrompt?: string;
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onMessageRewritten?: (index: number, total: number) => void;
  maxTraces?: number;
  regularModeConfig?: {
    provider: ProviderType;
    externalProvider: ExternalProvider;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    generationParams?: GenerationParams;
  };
  promptSet?: string;
  structuredOutput?: boolean;
  stream?: boolean;
  onStreamChunk?: import('../../types').StreamChunkCallback;
}

export const orchestrateConversationRewrite = async (
  params: ConversationRewriteParams
): Promise<SynthLogItem> => {
  const {
    messages,
    config,
    engineMode,
    converterPrompt,
    signal,
    maxRetries,
    retryDelay,
    generationParams,
    onMessageRewritten,
    maxTraces,
    regularModeConfig,
    promptSet,
    structuredOutput,
    stream,
    onStreamChunk
  } = params;

  const startTime = Date.now();
  const rewrittenMessages: ChatMessage[] = [];
  const MAX_MESSAGES_TO_STORE = 50;
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/i;
  let hasError = false;
  let errorMessages: string[] = [];

  logger.group("🔄 STARTING CONVERSATION TRACE REWRITING");
  logger.log("Total messages:", messages.length);
  logger.log("Engine mode:", engineMode);

  try {
    let assistantIndex = 0;
    const allAssistants = messages.filter(m => m.role === ChatRole.Assistant).length;
    const totalAssistants = maxTraces && maxTraces > 0 ? Math.min(maxTraces, allAssistants) : allAssistants;

    for (let i = 0; i < messages.length; i++) {
      if (signal?.aborted) break;

      const message = messages[i];

      if (message.role !== ChatRole.Assistant) {
        rewrittenMessages.push({ ...message });
        continue;
      }

      if (maxTraces && maxTraces > 0 && assistantIndex >= maxTraces) {
        rewrittenMessages.push({ ...message });
        continue;
      }

      assistantIndex++;

      const thinkMatch = message.content.match(thinkTagRegex);
      let originalThinking = "";
      let outsideThinkContent = message.content;
      let isImputation = false;

      if (!thinkMatch) {
        isImputation = true;
        logger.log(`Message ${i}: No think tags found. Switching to IMPUTATION mode.`);
        outsideThinkContent = message.content.trim();
      } else {
        originalThinking = thinkMatch[1].trim();
        outsideThinkContent = message.content.replace(thinkTagRegex, '').trim();
        logger.log(`Message ${i}: Rewriting think content (${originalThinking.length} chars)`);
      }

      const prevUserMsg = messages.slice(0, i).reverse().find(m => m.role === ChatRole.User);
      const userContext = prevUserMsg ? `[USER QUERY]:\n${prevUserMsg.content}\n\n` : '';

      let rewriteInput = "";
      if (isImputation) {
        rewriteInput = `
[TASK]: REVERSE ENGINEERING REASONING
[INSTRUCTION]: Analyze the [USER QUERY] and the [ASSISTANT RESPONSE]. Generate a detailed stenographic reasoning trace (<think>...</think>) that logically connects the query to the response.
${userContext}
[ASSISTANT RESPONSE]:
${outsideThinkContent}
`;
      } else {
        rewriteInput = `${userContext}[RAW REASONING TRACE]:\n${originalThinking}`;
      }

      let newReasoning: string;

      if (engineMode === EngineMode.Deep) {
        const deepResult = await orchestrateDeepReasoning({
          input: rewriteInput,
          config: config,
          signal: signal,
          maxRetries: maxRetries,
          retryDelay: retryDelay,
          generationParams: generationParams,
          structuredOutput: structuredOutput,
          expectedAnswer: outsideThinkContent,
          stream: stream,
          onStreamChunk: onStreamChunk
        });

        if (deepResult.isError) {
          logger.warn(`⚠️ Message rewrite failed for message ${i}, using original content`);
          hasError = true;
          errorMessages.push(`Message ${i}: ${deepResult.error || 'Unknown error'}`);
          newReasoning = originalThinking;
        } else {
          newReasoning = deepResult.reasoning || originalThinking;
          outsideThinkContent = deepResult.answer;
        }
      } else {
        if (regularModeConfig?.provider === ProviderType.Gemini) {
          const geminiPrompt = converterPrompt || PromptService.getSystemPrompt(PromptCategory.Converter, PromptRole.Writer, promptSet, structuredOutput);
          const result = await GeminiService.generateGenericJSON(
            rewriteInput,
            geminiPrompt,
            { maxRetries, retryDelay, generationParams: regularModeConfig.generationParams || generationParams }
          );
          newReasoning = result.reasoning || originalThinking;
        } else if (regularModeConfig) {
          const result = await ExternalApiService.callExternalApi({
            provider: regularModeConfig.externalProvider as any,
            apiKey: regularModeConfig.apiKey || SettingsService.getApiKey(regularModeConfig.externalProvider as any),
            model: regularModeConfig.model,
            customBaseUrl: regularModeConfig.customBaseUrl || SettingsService.getCustomBaseUrl(),
            userPrompt: `[INPUT LOGIC START]\n${rewriteInput}\n[INPUT LOGIC END]`,
            signal,
            maxRetries,
            retryDelay,
            generationParams,
            structuredOutput,
            stream: stream,
            onStreamChunk: onStreamChunk,
            streamPhase: 'regular'
          });
          newReasoning = result.reasoning || originalThinking;
        } else {
          const writerRes = await executePhase(
            config.phases.writer,
            rewriteInput,
            signal,
            maxRetries,
            retryDelay,
            config.phases.writer.generationParams || generationParams,
            structuredOutput
          );
          newReasoning = writerRes.result?.reasoning || originalThinking;
        }
      }

      const newContent = `<think>${newReasoning}</think>\n\n${outsideThinkContent}`;

      rewrittenMessages.push({
        ...message,
        content: newContent,
        reasoning: newReasoning
      });

      onMessageRewritten?.(assistantIndex - 1, totalAssistants);
      logger.log(`Message ${i}: Rewritten successfully (${assistantIndex}/${totalAssistants})`);
    }

    logger.log("✅ Conversation rewrite complete");
    logger.groupEnd();

    let finalMessages = rewrittenMessages;
    if (maxTraces && maxTraces > 0) {
      let assistantCount = 0;
      let cutoffIndex = rewrittenMessages.length;
      for (let i = 0; i < rewrittenMessages.length; i++) {
        if (rewrittenMessages[i].role === ChatRole.Assistant) {
          assistantCount++;
          if (assistantCount >= maxTraces) {
            cutoffIndex = i + 1;
            break;
          }
        }
      }
      finalMessages = rewrittenMessages.slice(0, cutoffIndex);
    }

    const messagesTruncated = finalMessages.length > MAX_MESSAGES_TO_STORE;
    const messagesForLog = messagesTruncated ? finalMessages.slice(-MAX_MESSAGES_TO_STORE) : finalMessages;

    const firstUser = messagesForLog.find(m => m.role === ChatRole.User);
    const displayQuery = firstUser?.content || "Conversation";

    if (signal?.aborted) {
      logger.warn("⚠️ Conversation rewrite was halted by user");
      logger.groupEnd();

      return {
        id: crypto.randomUUID(),
        seed_preview: displayQuery.substring(0, 150) + (displayQuery.length >= 150 ? "..." : ""),
        full_seed: rewrittenMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
        query: displayQuery,
        reasoning: rewrittenMessages.filter(m => m.role === ChatRole.Assistant && m.reasoning).map(m => m.reasoning).join('\n---\n'),
        answer: "Halted",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        modelUsed: engineMode === EngineMode.Deep ? `DEEP-REWRITE: ${config.phases.writer.model}` : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
        isError: true,
        status: LogItemStatus.ERROR,
        error: 'Halted by user',
        isMultiTurn: true,
        messages: rewrittenMessages.length > MAX_MESSAGES_TO_STORE ? rewrittenMessages.slice(-MAX_MESSAGES_TO_STORE) : rewrittenMessages,
        messagesTruncated: rewrittenMessages.length > MAX_MESSAGES_TO_STORE
      };
    }

    const allReasoning = messagesForLog.filter(m => m.role === ChatRole.Assistant && m.reasoning).map(m => m.reasoning).join('\n---\n');

    const finalResult: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: displayQuery + (displayQuery.length >= 150 ? "..." : ""),
      full_seed: messagesForLog.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
      query: displayQuery,
      reasoning: allReasoning,
      answer: messagesForLog[messagesForLog.length - 1]?.content || "",
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      tokenCount: messagesForLog.reduce((acc, m) => acc + Math.round((m.content?.length || 0) / 4), 0),
      modelUsed: engineMode === EngineMode.Deep ? `DEEP-REWRITE: ${config.phases.writer.model}` : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
      isMultiTurn: true,
      messages: messagesForLog,
      messagesTruncated
    };

    if (hasError) {
      finalResult.isError = true;
      finalResult.status = LogItemStatus.ERROR;
      finalResult.error = errorMessages.join('; ');
    }

    return finalResult;

  } catch (error: any) {
    logger.error("💥 Conversation rewrite failed:", error);
    logger.groupEnd();

    return {
      id: crypto.randomUUID(),
      seed_preview: "Conversation Rewrite Error",
      full_seed: messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
      query: "ERROR",
      reasoning: "",
      answer: "Conversation trace rewriting failed",
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      modelUsed: "REWRITE ENGINE",
      isError: true,
      error: error.message || "Unknown error during conversation rewriting",
      isMultiTurn: true,
      messages: messages.length > MAX_MESSAGES_TO_STORE ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages,
      messagesTruncated: messages.length > MAX_MESSAGES_TO_STORE
    };
  }
};
