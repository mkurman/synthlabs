
import { DeepConfig, DeepPhaseConfig, SynthLogItem, GenerationParams, ChatMessage, UserAgentConfig, StreamChunkCallback, StreamPhase, LogItemStatus, ProviderType, ApiType } from '../types';
import { JSON_SCHEMA_INSTRUCTION_PREFIX, JSON_OUTPUT_FALLBACK } from '../constants';
import * as GeminiService from './geminiService';
import * as ExternalApiService from './externalApiService';
import { SettingsService } from './settingsService';
import { logger } from '../utils/logger';
import { PromptService } from './promptService';
import * as PromptSchemaAdapter from './promptSchemaAdapter';

interface DeepOrchestrationParams {
  input: string;
  originalQuery?: string; // Clean input without expected answer, used for training data query field
  expectedAnswer?: string; // Optional reference answer from dataset
  config: DeepConfig;
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onPhaseComplete?: (phase: string) => void;
  structuredOutput?: boolean;
  // Streaming support - only for writer/rewriter phases
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
}

// Map phase IDs to prompt schemas (loaded once)
const PHASE_TO_SCHEMA: Record<string, () => import('../types').PromptSchema> = {
  'meta': () => PromptService.getPromptSchema('generator', 'meta'),
  'retrieval': () => PromptService.getPromptSchema('generator', 'retrieval'),
  'derivation': () => PromptService.getPromptSchema('generator', 'derivation'),
  'writer': () => PromptService.getPromptSchema('converter', 'writer'),
  'rewriter': () => PromptService.getPromptSchema('converter', 'rewriter'),
  'responder': () => PromptService.getPromptSchema('generator', 'responder'),
  'userAgent': () => PromptService.getPromptSchema('generator', 'user_agent')
};

const executePhase = async (
  phaseConfig: DeepPhaseConfig,
  userContent: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams,
  structuredOutput: boolean = true,
  streamOptions?: { stream: boolean; onStreamChunk?: StreamChunkCallback; streamPhase?: StreamPhase }
): Promise<{ result: any; model: string; input: string; duration: number; timestamp: string }> => {
  const { id, provider, externalProvider, apiType, apiKey, model, customBaseUrl, promptSchema: configSchema } = phaseConfig;
  const modelName = provider === 'gemini' ? 'Gemini 3 Flash' : `${externalProvider}/${model}`;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Get schema: from config if provided, otherwise lookup by phase ID
  const schema = configSchema || PHASE_TO_SCHEMA[id]?.();
  
  logger.groupCollapsed(`[Deep Phase: ${id.toUpperCase()}]`);
  logger.log("Model:", modelName);
  logger.log("Input Snippet:", userContent.substring(0, 150).replace(/\n/g, ' ') + "...");
  logger.log("System Prompt Snippet:", schema?.prompt.substring(0, 100) + "..." || '(none)');

  let result;
  try {
    if (provider === 'gemini') {
      // For Gemini, build the prompt with schema
      const geminiSystemPrompt = schema 
        ? (structuredOutput 
            ? schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
                type: 'object',
                properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
                required: schema.output.filter(f => !f.optional).map(f => f.name),
                additionalProperties: true
              })
            : schema.prompt + '\n\n' + JSON_OUTPUT_FALLBACK)
        : '\n\n' + JSON_OUTPUT_FALLBACK;
      result = await GeminiService.generateGenericJSON(userContent, geminiSystemPrompt, { maxRetries, retryDelay, generationParams, structuredOutput });
    } else {
      // Resolve API key from phaseConfig first, then fall back to SettingsService
      const resolvedApiKey = apiKey || (externalProvider ? SettingsService.getApiKey(externalProvider) : '');
      const resolvedBaseUrl = customBaseUrl || SettingsService.getCustomBaseUrl();

      // Determine appropriate schema for Responses API
      const responsesSchema: ExternalApiService.ResponsesSchemaName = 'reasoningTrace';

      result = await ExternalApiService.callExternalApi({
        provider: externalProvider,
        apiKey: resolvedApiKey,
        model: model,
        apiType: apiType || ApiType.Chat,
        customBaseUrl: resolvedBaseUrl,
        promptSchema: schema,
        userPrompt: userContent,
        signal: signal,
        maxRetries,
        retryDelay,
        generationParams,
        structuredOutput,
        responsesSchema,
        // Streaming: only enable if streamOptions provided with callback
        stream: streamOptions?.stream,
        onStreamChunk: streamOptions?.onStreamChunk,
        streamPhase: streamOptions?.streamPhase
      });
    }

    const duration = Date.now() - startTime;
    logger.log("✅ Success Payload:", result);
    logger.log(`⏱️ Duration: ${duration}ms`);

    // Schema validation: validate result against expected schema for this phase
    if (schema && result && typeof result === 'object') {
      try {
        const validation = PromptSchemaAdapter.parseAndValidateResponse(result, schema);

        if (!validation.isValid) {
          logger.warn(`⚠️ Phase ${id} result missing required fields:`, validation.missingFields);
          // Add ERROR marker to result but don't throw - let downstream handle it
          (result as any)._schemaValidation = {
            isValid: false,
            missingFields: validation.missingFields,
            error: validation.error
          };
        } else {
          // Replace result with filtered data (only schema-defined fields)
          result = validation.data;
          (result as any)._schemaValidation = { isValid: true };
        }
      } catch (validationError) {
        logger.warn(`⚠️ Schema validation error for phase ${id}:`, validationError);
      }
    }

    logger.groupEnd();

    // Check if result is an empty object (parsing failure)
    if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
      logger.warn(`⚠️ Phase ${id} returned empty JSON.`);
    }

    return { result, model: modelName, input: userContent, duration, timestamp };

  } catch (e: any) {
    logger.error(`❌ Phase Failed:`, e);
    logger.groupEnd();
    // Propagate the error with the phase ID attached
    throw new Error(`[${id.toUpperCase()}] failed: ${e.message || e}`);
  }
};

const getModelName = (cfg: DeepPhaseConfig) => {
  if (cfg.provider === 'gemini') return 'Gemini 3 Flash';
  return `${cfg.externalProvider}/${cfg.model}`;
};

const truncatePreview = (value: string, maxLen: number = 500): string => {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}...`;
};

const toPreviewString = (value: any, maxLen: number = 800): string => {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return truncatePreview(str, maxLen);
  } catch {
    return '[Unserializable Output]';
  }
};

export const orchestrateDeepReasoning = async (
  params: DeepOrchestrationParams
): Promise<SynthLogItem> => {
  const { input, originalQuery, expectedAnswer, config, signal, maxRetries, retryDelay, onPhaseComplete, generationParams, structuredOutput, stream, onStreamChunk } = params;

  // Use originalQuery for output fields (training data), fall back to input if not provided
  const cleanQuery = originalQuery || input;

  // Storage for the full history of each step
  const deepTrace: Record<string, { model: string; input: string; output: any; timestamp: string; duration: number }> = {};

  logger.group("🚀 STARTING DEEP REASONING ORCHESTRATION");
  logger.log("Seed:", input);

  try {
    // 1. Parallel Execution of Phase 0, 1, 2
    const metaPromise = executePhase(config.phases.meta, input, signal, maxRetries, retryDelay, config.phases.meta.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('meta');
        deepTrace.meta = {
          model: res.model,
          input: truncatePreview(res.input),
          output: toPreviewString(res.result),
          timestamp: res.timestamp,
          duration: res.duration
        };
        return res.result;
      });

    const retrievalPromise = executePhase(config.phases.retrieval, input, signal, maxRetries, retryDelay, config.phases.retrieval.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('retrieval');
        deepTrace.retrieval = {
          model: res.model,
          input: truncatePreview(res.input),
          output: toPreviewString(res.result),
          timestamp: res.timestamp,
          duration: res.duration
        };
        return res.result;
      });

    const derivationPromise = executePhase(config.phases.derivation, input, signal, maxRetries, retryDelay, config.phases.derivation.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('derivation');
        deepTrace.derivation = {
          model: res.model,
          input: truncatePreview(res.input),
          output: toPreviewString(res.result),
          timestamp: res.timestamp,
          duration: res.duration
        };
        return res.result;
      });

    const [metaResult, retrievalResult, derivationResult] = await Promise.all([
      metaPromise,
      retrievalPromise,
      derivationPromise
    ]);

    // 2. Aggregate Context for the Writer
    const aggregatedContext = `
# SYSTEM ORCHESTRATION REPORT
You are the [FINAL SYNTHESIS AGENT]. Your inputs are the reports from three specialized sub-agents (Meta-Analysis, Retrieval, Derivation) analyzing the [ORIGINAL SEED].

## 1. SOURCE DATA
[ORIGINAL SEED]
${input}

[FINAL ANSWER]
${expectedAnswer}

## 2. AGENT REPORTS
### PHASE 1: META-ANALYSIS (Intent & Traps)
${JSON.stringify(metaResult, null, 2)}

### PHASE 2: RETRIEVAL (Facts & Constraints)
${JSON.stringify(retrievalResult, null, 2)}

### PHASE 3: DERIVATION (Logical Steps)
${JSON.stringify(derivationResult, null, 2)}

## 3. SYNTHESIS INSTRUCTION
Your goal is to unify these insights into a SINGLE, PERFECT "Stenographic Reasoning Trace" and final answer.

**MANDATORY OUTPUT FORMAT (JSON ONLY)**
You must output a single valid JSON object. Do NOT wrap it in markdown code blocks.
{
  "reasoning": "A single continuous string using stenographic symbols (→, ↺, ∴, ●, ⚠) combining Phase 2 constraints and Phase 3 logic."
}
`;

    logger.log("📝 Constructed Aggregated Context for Writer:", aggregatedContext);

    // 3. Execute Writer Phase (with optional streaming)
    const writerRes = await executePhase(
      config.phases.writer,
      aggregatedContext,
      signal,
      maxRetries,
      retryDelay,
      config.phases.writer.generationParams || generationParams,
      true, // structuredOutput
      stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'writer' } : undefined
    );

    deepTrace.writer = {
      model: writerRes.model,
      input: truncatePreview(writerRes.input),
      output: toPreviewString(writerRes.result),
      timestamp: writerRes.timestamp,
      duration: writerRes.duration
    };
    onPhaseComplete?.('writer');

    let writerResult = writerRes.result;

    // Validate Writer Output
    // Validate Writer Output
    if (!writerResult || !writerResult.reasoning) {
      throw new Error("[WRITER] produced empty or invalid JSON output.");
    }

    // 4. Optional Rewriter Phase
    if (config.phases.rewriter?.enabled) {
      logger.log("✨ Rewriter Phase Enabled - refining answer...");
      const rewriterInput = `
[QUERY]:
${writerResult.query}

[REASONING TRACE]:
${writerResult.reasoning}

Instructions: Based on the reasoning trace above, write the final high-quality response.
CRITICAL: " + JSON_OUTPUT_FALLBACK + " Format: { "answer": "Your final refined answer string here" }
`;
      const rewriterRes = await executePhase(
        config.phases.rewriter,
        rewriterInput,
        signal,
        maxRetries,
        retryDelay,
        config.phases.rewriter.generationParams || generationParams,
        true, // structuredOutput
        stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'rewriter' } : undefined
      );

      deepTrace.rewriter = {
        model: rewriterRes.model,
        input: truncatePreview(rewriterRes.input),
        output: toPreviewString(rewriterRes.result),
        timestamp: rewriterRes.timestamp,
        duration: rewriterRes.duration
      };
      onPhaseComplete?.('rewriter');

      // Robustly extract answer from various possible keys (case-insensitive)
      let newAnswer = "";
      if (rewriterRes.result) {
        if (typeof rewriterRes.result === 'string') {
          newAnswer = rewriterRes.result;
        } else if (typeof rewriterRes.result === 'object') {
          // Flatten keys to lowercase
          const normalized = Object.keys(rewriterRes.result).reduce((acc, key) => {
            acc[key.toLowerCase()] = rewriterRes.result[key];
            return acc;
          }, {} as Record<string, any>);

          newAnswer = normalized.answer ||
            normalized.response ||
            normalized.content ||
            normalized.text ||
            normalized.res ||
            normalized.output ||
            "";
        }
      }

      if (newAnswer && newAnswer.trim().length > 0) {
        // Explicitly set the answer on the writerResult object
        writerResult.answer = newAnswer.trim();
        logger.log("✅ Rewriter successfully refined the answer", newAnswer.substring(0, 50) + "...");
      } else {
        logger.warn("⚠️ Rewriter returned empty or invalid format, keeping original answer.", {
          result: rewriterRes.result,
          keys: typeof rewriterRes.result === 'object' ? Object.keys(rewriterRes.result) : 'not-object',
          normalizedKeys: typeof rewriterRes.result === 'object' ? Object.keys(rewriterRes.result).map(k => k.toLowerCase()) : []
        });
      }
    } else {
      // Get the writer schema to check what output fields are defined
      const writerSchema = config.phases.writer.promptSchema || PHASE_TO_SCHEMA['writer']?.();
      const schemaOutputFields = writerSchema?.output?.map(f => f.name) || [];
      const schemaDefinesAnswer = schemaOutputFields.includes('answer');
      
      // If schema defines answer, we must use what the model produced.
      // If model didn't produce it, that's an error - we don't fallback.
      if (schemaDefinesAnswer && !writerResult.answer) {
        throw new Error("[WRITER] Schema requires 'answer' field but model did not produce it.");
      }
    }

    // Set Query from originalQuery (clean input without expected answer)
    // The user wants their actual input preserved, not an AI-generated intent like 'educational'
    writerResult.query = cleanQuery.trim();

    logger.groupEnd();

    // 5. Return formatted log item
    // Check writer schema to determine if answer is a defined output field
    const writerSchema = config.phases.writer.promptSchema || PHASE_TO_SCHEMA['writer']?.();
    const schemaOutputFields = writerSchema?.output?.map(f => f.name) || [];
    const schemaDefinesAnswer = schemaOutputFields.includes('answer');
    
    // Schema compliance logic:
    // - If schema has "answer" key: MUST use model output (writerResult.answer)
    //   If model didn't produce it, throw error
    // - If schema doesn't have "answer" key: use expectedAnswer (from dataset)
    //   We ONLY care about fields defined in the schema
    let finalAnswer: string;
    if (schemaDefinesAnswer) {
      // Schema requires answer - model MUST produce it
      if (!writerResult.answer) {
        throw new Error("[WRITER] Schema requires 'answer' field but model did not produce it.");
      }
      finalAnswer = writerResult.answer;
    } else {
      // Schema doesn't define answer - use expectedAnswer from dataset
      finalAnswer = expectedAnswer || "";
    }
    
    const finalLogItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: cleanQuery.substring(0, 150) + "...",
      full_seed: cleanQuery,
      query: cleanQuery.trim(), // Use clean input (without expected answer) as query
      reasoning: writerResult.reasoning || "Writer failed to generate reasoning.",
      answer: finalAnswer,
      timestamp: new Date().toISOString(),
      modelUsed: `DEEP: ${config.phases.writer.model}`,
      provider: config.phases.writer.provider === 'gemini' ? 'gemini' : config.phases.writer.externalProvider,
      deepMetadata: {
        meta: getModelName(config.phases.meta),
        retrieval: getModelName(config.phases.retrieval),
        derivation: getModelName(config.phases.derivation),
        writer: getModelName(config.phases.writer),
        rewriter: config.phases.rewriter?.enabled ? getModelName(config.phases.rewriter) : undefined
      },
      deepTrace: deepTrace // Full history stored here
    };

    return finalLogItem;

  } catch (error: any) {
    logger.error("💥 ORCHESTRATION FATAL ERROR:", error);
    logger.groupEnd();

    // Return an error object that the UI can render gracefully
    return {
      id: crypto.randomUUID(),
      seed_preview: input.substring(0, 50),
      full_seed: input,
      query: "ERROR",
      reasoning: "",
      answer: "Orchestration Failed",
      timestamp: new Date().toISOString(),
      modelUsed: "DEEP ENGINE",
      isError: true,
      error: error.message || "Unknown error during deep reasoning",
      deepTrace: deepTrace as any // Return whatever trace we managed to capture even on error
    };
  }
};

// ============================================================================
// MULTI-TURN CONVERSATION ORCHESTRATION
// ============================================================================

interface MultiTurnOrchestrationParams {
  initialInput: string;
  initialQuery?: string; // The question/query to show as first user message
  initialResponse?: string; // Pre-generated response from DEEP mode
  initialReasoning?: string; // Pre-generated reasoning from DEEP mode
  userAgentConfig: UserAgentConfig;
  responderConfig: {
    provider: ProviderType;
    externalProvider: string;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    apiType?: ApiType;
    promptSchema?: import('../types').PromptSchema;
    generationParams?: GenerationParams;
  };
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  promptSet?: string; // Optional prompt set for fallback prompt loading (auto-routing)
  structuredOutput?: boolean;
  // Streaming for responder (user follow-up responses)
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
}

/**
 * Orchestrates a multi-turn conversation by:
 * 1. Generating an initial response to the seed input
 * 2. Looping N times (followUpCount):
 *    a. User Agent generates a follow-up question
 *    b. Responder generates reasoning + answer
 * 3. Returns a SynthLogItem with isMultiTurn=true and populated messages[]
 */
export const orchestrateMultiTurnConversation = async (
  params: MultiTurnOrchestrationParams
): Promise<SynthLogItem> => {
  const { initialInput, initialQuery, initialResponse: preGeneratedResponse, initialReasoning: preGeneratedReasoning, userAgentConfig, responderConfig, signal, maxRetries, retryDelay, generationParams, promptSet, structuredOutput, stream, onStreamChunk } = params;
  const startTime = Date.now();
  const MAX_MESSAGES_TO_STORE = 50;

  // Heuristic: Use initialInput (user's selected column content) if the inferred query looks like a database ID/slug or is missing.
  // This addresses the issue where "identify_preventive_measure_for_SIDS" (an ID) is shown instead of the actual question.
  let displayQuery = initialQuery || "";
  const isSlugOrId = (s: string) => {
    if (!s) return true;
    if (s === "Inferred Query" || s === "Refined Query") return true;
    // Check for "slug_style_string" with no spaces, or very short strings
    return (!s.includes(' ') && s.length < 50) || s.length < 5;
  };

  if (isSlugOrId(displayQuery)) {
    displayQuery = initialInput;
  }

  const messages: ChatMessage[] = [];

  // Helper to format assistant content with <think> tags
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

  // Get responder schema once for schema compliance checks
  const responderSchema = responderConfig.promptSchema || PHASE_TO_SCHEMA['responder']?.();
  const schemaOutputFields = responderSchema?.output?.map((f: any) => f.name) || [];
  const schemaDefinesAnswer = schemaOutputFields.includes('answer');
  const schemaDefinesReasoning = schemaOutputFields.includes('reasoning');

  try {
    // Initial user message from the query (not the full reasoning trace)
    messages.push({
      role: 'user',
      content: displayQuery
    });

    let firstResponse: string;
    let firstReasoning: string | undefined;

    // Use pre-generated response from DEEP if provided, otherwise generate new
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
      
      // Schema compliance: check responder schema for required fields
      // If schema requires answer, model must produce it
      if (schemaDefinesAnswer && !generatedResponse.answer) {
        throw new Error("[MULTI-TURN] Schema requires 'answer' field but model did not produce it.");
      }
      
      // If schema requires reasoning, model must produce it
      if (schemaDefinesReasoning && !generatedResponse.reasoning) {
        throw new Error("[MULTI-TURN] Schema requires 'reasoning' field but model did not produce it.");
      }
      
      firstResponse = generatedResponse.answer || generatedResponse.reasoning || "No response generated.";
      firstReasoning = generatedResponse.reasoning;
    }

    messages.push({
      role: 'assistant',
      content: formatAssistantContent(firstResponse, firstReasoning),
      reasoning: firstReasoning
    });

    // Loop for follow-up questions
    for (let i = 0; i < userAgentConfig.followUpCount; i++) {
      if (signal?.aborted) break;

      logger.log(`🔁 Turn ${i + 1}/${userAgentConfig.followUpCount}`);

      // Build conversation context for User Agent
      const conversationContext = messages
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n\n');

      // Generate follow-up question
      const userAgentInput = `Conversation so far:\n${conversationContext}\n\nGenerate a follow-up question.`;
      const followUpResult = await callAgent(
        {
          provider: userAgentConfig.provider,
          externalProvider: userAgentConfig.externalProvider,
          apiKey: userAgentConfig.apiKey,
          model: userAgentConfig.model,
          customBaseUrl: userAgentConfig.customBaseUrl,
          promptSchema: userAgentConfig.promptSchema || PHASE_TO_SCHEMA['userAgent']?.(),
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

      messages.push({
        role: 'user',
        content: followUpQuestion
      });

      // Generate response to follow-up
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

      // Schema compliance: check responder schema for required fields
      if (schemaDefinesAnswer && !responseResult.answer) {
        throw new Error("[MULTI-TURN] Schema requires 'answer' field but model did not produce it for follow-up response.");
      }
      if (schemaDefinesReasoning && !responseResult.reasoning) {
        throw new Error("[MULTI-TURN] Schema requires 'reasoning' field but model did not produce it for follow-up response.");
      }

      messages.push({
        role: 'assistant',
        content: formatAssistantContent(responseResult.answer || responseResult.reasoning || "Response generated.", responseResult.reasoning),
        reasoning: responseResult.reasoning
      });
    }

    // Check if the conversation was aborted/halted
    if (signal?.aborted) {
      logger.warn("⚠️ Multi-turn conversation was halted by user");
      logger.groupEnd();

      return {
        id: crypto.randomUUID(),
        seed_preview: displayQuery.substring(0, 150) + (displayQuery.length > 150 ? "..." : ""),
        full_seed: initialInput,
        query: initialQuery || displayQuery,
        reasoning: messages.filter(m => m.role === 'assistant').map(m => m.reasoning).filter(Boolean).join('\n---\n'),
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

    // Build final log item
    const logItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: displayQuery.substring(0, 150) + (displayQuery.length > 150 ? "..." : ""),
      full_seed: initialInput,
      query: initialQuery || displayQuery,

      reasoning: messagesForLog.filter(m => m.role === 'assistant').map(m => m.reasoning).filter(Boolean).join('\n---\n'),
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

// Helper function to call an agent (Gemini or External)
// Uses PromptSchema object directly - no string lookups!
const callAgent = async (
  config: {
    provider: ProviderType;
    externalProvider: string;
    apiType?: ApiType;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    /**
     * The prompt schema object. Pass this directly instead of strings!
     */
    promptSchema?: import('../types').PromptSchema;
    generationParams?: GenerationParams;
  },
  userContent: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams,
  structuredOutput: boolean = true,
  streamOptions?: { stream: boolean; onStreamChunk?: StreamChunkCallback; streamPhase?: StreamPhase }
): Promise<any> => {
  const effectiveParams = config.generationParams || generationParams;
  const schema = config.promptSchema;
  
  // Determine responses schema based on output fields
  let responsesSchema: ExternalApiService.ResponsesSchemaName = 'reasoningTrace';
  if (schema?.output.some(f => f.name === 'follow_up_question' || f.name === 'question')) {
    responsesSchema = 'userAgentResponse';
  }
  
  if (config.provider === 'gemini') {
    // Build system prompt from schema
    let geminiSystemPrompt = '\n\n' + JSON_OUTPUT_FALLBACK;
    if (schema) {
      if (structuredOutput) {
        geminiSystemPrompt = schema.prompt + '\n\n' + JSON_SCHEMA_INSTRUCTION_PREFIX + ' ' + JSON.stringify({
          type: 'object',
          properties: Object.fromEntries(schema.output.map(f => [f.name, { type: 'string', description: f.description }])),
          required: schema.output.filter(f => !f.optional).map(f => f.name),
          additionalProperties: true
        });
      } else {
        const example: Record<string, string> = {};
        for (const field of schema.output) {
          const suffix = field.optional ? ' (optional)' : '';
          example[field.name] = field.description.substring(0, 50) + (field.description.length > 50 ? '...' : '') + suffix;
        }
        geminiSystemPrompt = schema.prompt + '\n\n' + JSON_OUTPUT_FALLBACK + ': ' + JSON.stringify(example);
      }
    }
    return await GeminiService.generateGenericJSON(userContent, geminiSystemPrompt, { maxRetries, retryDelay, generationParams: effectiveParams });
  } else {
    return await ExternalApiService.callExternalApi({
      provider: config.externalProvider as any,
      apiKey: config.apiKey,
      model: config.model,
      apiType: config.apiType || ApiType.Chat,
      customBaseUrl: config.customBaseUrl,
      promptSchema: schema,
      userPrompt: userContent,
      signal,
      maxRetries,
      retryDelay,
      generationParams: effectiveParams,
      structuredOutput,
      responsesSchema,
      stream: streamOptions?.stream,
      onStreamChunk: streamOptions?.onStreamChunk,
      streamPhase: streamOptions?.streamPhase
    });
  }
};

// ============================================================================
// CONVERSATION TRACE REWRITING
// ============================================================================

interface ConversationRewriteParams {
  messages: ChatMessage[];            // Existing conversation
  config: DeepConfig;                 // DEEP mode config
  engineMode: 'regular' | 'deep';     // Which engine to use
  converterPrompt?: string;           // For regular mode
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onMessageRewritten?: (index: number, total: number) => void;
  maxTraces?: number;                 // Max number of assistant messages to process (undefined = all)
  // For regular mode external API
  regularModeConfig?: {
    provider: 'gemini' | 'external';
    externalProvider: string;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    generationParams?: GenerationParams;
  };
  promptSet?: string;
  structuredOutput?: boolean;                // Optional prompt set for fallback prompt loading (auto-routing)
  // Streaming support
  stream?: boolean;
  onStreamChunk?: StreamChunkCallback;
}

/**
 * Rewrites reasoning traces in an existing conversation.
 * 
 * Process:
 * 1. Iterate through all messages in the conversation
 * 2. For each assistant message with <think>...</think> content:
 *    a. Extract the reasoning trace
 *    b. Run it through DEEP or regular converter to create symbolic reasoning
 *    c. Replace the <think> content with the new reasoning
 * 3. Return the conversation with updated reasoning traces
 */
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
    const allAssistants = messages.filter(m => m.role === 'assistant').length;
    const totalAssistants = maxTraces && maxTraces > 0 ? Math.min(maxTraces, allAssistants) : allAssistants;

    for (let i = 0; i < messages.length; i++) {
      if (signal?.aborted) break;

      const message = messages[i];

      // Keep user/system messages unchanged
      if (message.role !== 'assistant') {
        rewrittenMessages.push({ ...message });
        continue;
      }

      // Stop processing if we've reached the max traces limit
      if (maxTraces && maxTraces > 0 && assistantIndex >= maxTraces) {
        // Copy remaining assistant messages unchanged
        rewrittenMessages.push({ ...message });
        continue;
      }

      assistantIndex++;

      // Check if this message has <think> content
      const thinkMatch = message.content.match(thinkTagRegex);
      let originalThinking = "";
      let outsideThinkContent = message.content;
      let isImputation = false;

      if (!thinkMatch) {
        // No <think> tags, but we are in "Generate/Rewrite" mode.
        // If we are in Generator mode (implied by this function being called for an implementation plan that supports it),
        // we should "impute" the reasoning.
        isImputation = true;
        logger.log(`Message ${i}: No think tags found. Switching to IMPUTATION mode.`);
        outsideThinkContent = message.content.trim();
      } else {
        originalThinking = thinkMatch[1].trim();
        outsideThinkContent = message.content.replace(thinkTagRegex, '').trim();
        logger.log(`Message ${i}: Rewriting think content (${originalThinking.length} chars)`);
      }

      // Build context for rewriting - include the user question from previous message
      const prevUserMsg = messages.slice(0, i).reverse().find(m => m.role === 'user');
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

      if (engineMode === 'deep') {
        // Use DEEP pipeline for rewriting
        const deepResult = await orchestrateDeepReasoning({
          input: rewriteInput,
          config: config,
          signal: signal,
          maxRetries: maxRetries,
          retryDelay: retryDelay,
          generationParams: generationParams,
          structuredOutput: structuredOutput,
          expectedAnswer: outsideThinkContent,
          // Streaming for writer/rewriter phases
          stream: stream,
          onStreamChunk: onStreamChunk
        });

        // Check if orchestration failed - if so, use original values instead of error values
        if (deepResult.isError) {
          logger.warn(`⚠️ Message rewrite failed for message ${i}, using original content`);
          hasError = true;
          errorMessages.push(`Message ${i}: ${deepResult.error || 'Unknown error'}`);
          newReasoning = originalThinking;
          // outsideThinkContent remains unchanged (original answer)
        } else {
          newReasoning = deepResult.reasoning || originalThinking;
          // Use deepResult.answer which already applies schema logic:
          // - If schema has "answer" key: uses model output (or errors if missing)
          // - If schema doesn't have "answer" key: uses expectedAnswer (outsideThinkContent)
          outsideThinkContent = deepResult.answer;
        }
      } else {
        // Use regular converter with schema-based approach
        if (regularModeConfig?.provider === 'gemini') {
          const geminiPrompt = converterPrompt || PromptService.getSystemPrompt('converter', 'writer', promptSet, structuredOutput);
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
            // Use schema-based approach
            userPrompt: `[INPUT LOGIC START]\n${rewriteInput}\n[INPUT LOGIC END]`,
            signal,
            maxRetries,
            retryDelay,
            generationParams,
            structuredOutput,
            // Streaming for regular mode
            stream: stream,
            onStreamChunk: onStreamChunk,
            streamPhase: 'regular'
          });
          newReasoning = result.reasoning || originalThinking;
        } else {
          // Fallback - use DEEP writer phase
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

      // Reconstruct the message with new reasoning
      const newContent = `<think>${newReasoning}</think>\n\n${outsideThinkContent}`;

      rewrittenMessages.push({
        ...message,
        content: newContent,
        reasoning: newReasoning
      });

      // Report progress (use 0-indexed for UI display)
      onMessageRewritten?.(assistantIndex - 1, totalAssistants);
      logger.log(`Message ${i}: Rewritten successfully (${assistantIndex}/${totalAssistants})`);
    }

    logger.log("✅ Conversation rewrite complete");
    logger.groupEnd();

    // Truncate messages if maxTraces is set - keep only up to maxTraces assistant messages
    let finalMessages = rewrittenMessages;
    if (maxTraces && maxTraces > 0) {
      let assistantCount = 0;
      let cutoffIndex = rewrittenMessages.length;
      for (let i = 0; i < rewrittenMessages.length; i++) {
        if (rewrittenMessages[i].role === 'assistant') {
          assistantCount++;
          if (assistantCount >= maxTraces) {
            cutoffIndex = i + 1; // Include this assistant message
            break;
          }
        }
      }
      finalMessages = rewrittenMessages.slice(0, cutoffIndex);
    }

    const messagesTruncated = finalMessages.length > MAX_MESSAGES_TO_STORE;
    const messagesForLog = messagesTruncated ? finalMessages.slice(-MAX_MESSAGES_TO_STORE) : finalMessages;

    // Build the display query from first user message
    const firstUser = messagesForLog.find(m => m.role === 'user');
    const displayQuery = firstUser?.content || "Conversation";

    // Check if the rewrite was aborted/halted
    if (signal?.aborted) {
      logger.warn("⚠️ Conversation rewrite was halted by user");
      logger.groupEnd();

      return {
        id: crypto.randomUUID(),
        seed_preview: displayQuery.substring(0, 150) + (displayQuery.length >= 150 ? "..." : ""),
        full_seed: rewrittenMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n'),
        query: displayQuery,
        reasoning: rewrittenMessages
          .filter(m => m.role === 'assistant' && m.reasoning)
          .map(m => m.reasoning)
          .join('\n---\n'),
        answer: "Halted",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        modelUsed: engineMode === 'deep' ? `DEEP-REWRITE: ${config.phases.writer.model}` : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
        isError: true,
        status: LogItemStatus.ERROR,
        error: 'Halted by user',
        isMultiTurn: true,
        messages: rewrittenMessages.length > MAX_MESSAGES_TO_STORE ? rewrittenMessages.slice(-MAX_MESSAGES_TO_STORE) : rewrittenMessages,
        messagesTruncated: rewrittenMessages.length > MAX_MESSAGES_TO_STORE
      };
    }

    // Combine all reasoning traces for the main reasoning field
    const allReasoning = messagesForLog
      .filter(m => m.role === 'assistant' && m.reasoning)
      .map(m => m.reasoning)
      .join('\n---\n');

    // Build final result, marking as error if any message rewrite failed
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
      modelUsed: engineMode === 'deep' ? `DEEP-REWRITE: ${config.phases.writer.model}` : `REWRITE: ${regularModeConfig?.model || 'converter'}`,
      isMultiTurn: true,
      messages: messagesForLog,
      messagesTruncated
    };

    // If any message rewrite failed, mark the result as an error
    if (hasError) {
      finalResult.isError = true;
      finalResult.status = 'ERROR';
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
