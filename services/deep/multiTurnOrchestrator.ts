import { SynthLogItem, GenerationParams, ChatMessage, UserAgentConfig, LogItemStatus, ProviderType, ApiType, ChatRole, ExternalProvider } from '../../types';
import { DeepPhase, OutputFieldName } from '../../interfaces/enums';
import { logger } from '../../utils/logger';
import { PHASE_TO_SCHEMA } from './phaseExecutor';
import { callAgent } from './agentCaller';

export interface MultiTurnOrchestrationParams {
  initialInput: string;
  initialQuery?: string;
  initialResponse?: string;
  initialReasoning?: string;
  userAgentConfig: UserAgentConfig;
  responderConfig: {
    provider: ProviderType;
    externalProvider: ExternalProvider;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    apiType?: ApiType;
    promptSchema?: import('../../types').PromptSchema;
    generationParams?: GenerationParams;
  };
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  promptSet?: string;
  structuredOutput?: boolean;
  stream?: boolean;
  onStreamChunk?: import('../../types').StreamChunkCallback;
}

export const orchestrateMultiTurnConversation = async (
  params: MultiTurnOrchestrationParams
): Promise<SynthLogItem> => {
  const { initialInput, initialQuery, initialResponse: preGeneratedResponse, initialReasoning: preGeneratedReasoning, userAgentConfig, responderConfig, signal, maxRetries, retryDelay, generationParams, structuredOutput, stream, onStreamChunk } = params;
  const startTime = Date.now();
  const MAX_MESSAGES_TO_STORE = 50;

  let displayQuery = initialQuery || "";
  const isSlugOrId = (s: string) => {
    if (!s) return true;
    if (s === "Inferred Query" || s === "Refined Query") return true;
    return (!s.includes(' ') && s.length < 50) || s.length < 5;
  };

  if (isSlugOrId(displayQuery)) {
    displayQuery = initialInput;
  }

  const messages: ChatMessage[] = [];

  const formatAssistantContent = (answer: string, reasoning?: string): string => {
    if (reasoning && reasoning.trim()) {
      return `<think>${reasoning.trim()}</think>\n\n${answer.trim()}`;
    }
    return answer.trim();
  };

  logger.group("🔄 STARTING MULTI-TURN CONVERSATION ORCHESTRATION");
  logger.log("Initial Input:", initialInput.substring(0, 100) + "...");
  logger.log("Follow-up Count:", userAgentConfig.followUpCount);
  logger.log("Using pre-generated response:", !!preGeneratedResponse);

  const responderSchema = responderConfig.promptSchema || PHASE_TO_SCHEMA[DeepPhase.Responder]?.();
  const schemaOutputFields = responderSchema?.output?.map((f: any) => f.name) || [];
  const schemaDefinesAnswer = schemaOutputFields.includes(OutputFieldName.Answer);
  const schemaDefinesReasoning = schemaOutputFields.includes(OutputFieldName.Reasoning);

  try {
    messages.push({ role: ChatRole.User, content: displayQuery });

    let firstResponse: string;
    let firstReasoning: string | undefined;

    if (preGeneratedResponse) {
      logger.log("📝 Using pre-generated response from DEEP mode...");
      firstResponse = preGeneratedResponse;
      firstReasoning = preGeneratedReasoning;
    } else {
      logger.log("📝 Generating initial response...");
      const generatedResponse = await callAgent(
        {
          provider: responderConfig.provider,
          externalProvider: responderConfig.externalProvider,
          apiType: responderConfig.apiType,
          apiKey: responderConfig.apiKey,
          model: responderConfig.model,
          customBaseUrl: responderConfig.customBaseUrl,
          promptSchema: responderSchema,
          generationParams: responderConfig.generationParams
        },
        initialInput,
        signal,
        maxRetries,
        retryDelay,
        responderConfig.generationParams || generationParams,
        structuredOutput,
        stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'user_followup' } : undefined
      );
      
      if (schemaDefinesAnswer && !generatedResponse.answer) {
        throw new Error(`[MULTI-TURN] Schema requires '${OutputFieldName.Answer}' field but model did not produce it.`);
      }
      if (schemaDefinesReasoning && !generatedResponse.reasoning) {
        throw new Error(`[MULTI-TURN] Schema requires '${OutputFieldName.Reasoning}' field but model did not produce it.`);
      }
      
      firstResponse = generatedResponse.answer || generatedResponse.reasoning || "No response generated.";
      firstReasoning = generatedResponse.reasoning;
    }

    messages.push({
      role: ChatRole.Assistant,
      content: formatAssistantContent(firstResponse, firstReasoning),
      reasoning: firstReasoning
    });

    for (let i = 0; i < userAgentConfig.followUpCount; i++) {
      if (signal?.aborted) break;

      logger.log(`🔁 Turn ${i + 1}/${userAgentConfig.followUpCount}`);

      const conversationContext = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
      const userAgentInput = `Conversation so far:\n${conversationContext}\n\nGenerate a follow-up question.`;
      
      const followUpResult = await callAgent(
        {
          provider: userAgentConfig.provider,
          externalProvider: userAgentConfig.externalProvider,
          apiKey: userAgentConfig.apiKey,
          model: userAgentConfig.model,
          customBaseUrl: userAgentConfig.customBaseUrl,
          promptSchema: userAgentConfig.promptSchema || PHASE_TO_SCHEMA[DeepPhase.UserAgent]?.(),
          generationParams: userAgentConfig.generationParams
        },
        userAgentInput,
        signal,
        maxRetries,
        retryDelay,
        userAgentConfig.generationParams || generationParams,
        structuredOutput
      );

      const followUpQuestion = followUpResult.follow_up_question || followUpResult.question || "Could you elaborate further?";
      messages.push({ role: ChatRole.User, content: followUpQuestion });

      const responseInput = `Previous conversation:\n${conversationContext}\n\n[USER]: ${followUpQuestion}\n\nProvide a detailed response using symbolic reasoning.`;
      const responseResult = await callAgent(
        {
          provider: responderConfig.provider,
          externalProvider: responderConfig.externalProvider,
          apiType: responderConfig.apiType,
          apiKey: responderConfig.apiKey,
          model: responderConfig.model,
          customBaseUrl: responderConfig.customBaseUrl,
          promptSchema: responderSchema,
          generationParams: responderConfig.generationParams
        },
        responseInput,
        signal,
        maxRetries,
        retryDelay,
        responderConfig.generationParams || generationParams,
        structuredOutput,
        stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'user_followup' } : undefined
      );

      if (schemaDefinesAnswer && !responseResult.answer) {
        throw new Error(`[MULTI-TURN] Schema requires '${OutputFieldName.Answer}' field but model did not produce it for follow-up response.`);
      }
      if (schemaDefinesReasoning && !responseResult.reasoning) {
        throw new Error(`[MULTI-TURN] Schema requires '${OutputFieldName.Reasoning}' field but model did not produce it for follow-up response.`);
      }

      messages.push({
        role: ChatRole.Assistant,
        content: formatAssistantContent(responseResult.answer || responseResult.reasoning || "Response generated.", responseResult.reasoning),
        reasoning: responseResult.reasoning
      });
    }

    if (signal?.aborted) {
      logger.warn("⚠️ Multi-turn conversation was halted by user");
      logger.groupEnd();

      return {
        id: crypto.randomUUID(),
        seed_preview: displayQuery.substring(0, 150) + (displayQuery.length > 150 ? "..." : ""),
        full_seed: initialInput,
        query: initialQuery || displayQuery,
        reasoning: messages.filter(m => m.role === ChatRole.Assistant).map(m => m.reasoning).filter(Boolean).join('\n---\n'),
        answer: "Halted",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        modelUsed: `MULTI: ${responderConfig.model}`,
        isError: true,
        status: LogItemStatus.ERROR,
        error: 'Halted by user',
        isMultiTurn: true,
        messages: messages.length > MAX_MESSAGES_TO_STORE ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages,
        messagesTruncated: messages.length > MAX_MESSAGES_TO_STORE
      };
    }

    logger.log("✅ Multi-turn conversation complete. Total turns:", messages.length);
    logger.groupEnd();

    const messagesTruncated = messages.length > MAX_MESSAGES_TO_STORE;
    const messagesForLog = messagesTruncated ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages;

    const logItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: displayQuery.substring(0, 150) + (displayQuery.length > 150 ? "..." : ""),
      full_seed: initialInput,
      query: initialQuery || displayQuery,
      reasoning: messagesForLog.filter(m => m.role === ChatRole.Assistant).map(m => m.reasoning).filter(Boolean).join('\n---\n'),
      answer: messagesForLog[messagesForLog.length - 1]?.content || "",
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      tokenCount: messagesForLog.reduce((acc, m) => acc + Math.round((m.content?.length || 0) / 4), 0),
      modelUsed: `MULTI: ${responderConfig.model}`,
      isMultiTurn: true,
      messages: messagesForLog,
      messagesTruncated
    };

    return logItem;

  } catch (error: any) {
    logger.error("💥 Multi-turn orchestration failed:", error);
    logger.groupEnd();

    return {
      id: crypto.randomUUID(),
      seed_preview: initialInput.substring(0, 50),
      full_seed: initialInput,
      query: "ERROR",
      reasoning: "",
      answer: "Multi-turn conversation failed",
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      modelUsed: "MULTI ENGINE",
      isError: true,
      error: error.message || "Unknown error",
      isMultiTurn: true,
      messages: messages.length > MAX_MESSAGES_TO_STORE ? messages.slice(-MAX_MESSAGES_TO_STORE) : messages,
      messagesTruncated: messages.length > MAX_MESSAGES_TO_STORE
    };
  }
};
