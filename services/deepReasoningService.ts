
import { DeepConfig, DeepPhaseConfig, SynthLogItem, GenerationParams, ChatMessage, UserAgentConfig } from '../types';
import * as GeminiService from './geminiService';
import * as ExternalApiService from './externalApiService';
import { SettingsService } from './settingsService';
import { logger } from '../utils/logger';
import { DEEP_PHASE_PROMPTS } from '../constants';

interface DeepOrchestrationParams {
  input: string;
  config: DeepConfig;
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onPhaseComplete?: (phase: string) => void;
}

const executePhase = async (
  phaseConfig: DeepPhaseConfig,
  userContent: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams
): Promise<{ result: any; model: string; input: string; duration: number; timestamp: string }> => {
  const { id, provider, externalProvider, apiKey, model, customBaseUrl, systemPrompt } = phaseConfig;
  const modelName = provider === 'gemini' ? 'Gemini 3 Flash' : `${externalProvider}/${model}`;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  logger.groupCollapsed(`[Deep Phase: ${id.toUpperCase()}]`);
  logger.log("Model:", modelName);
  logger.log("Input Snippet:", userContent.substring(0, 150).replace(/\n/g, ' ') + "...");
  logger.log("System Prompt Snippet:", systemPrompt.substring(0, 100) + "...");

  let result;
  try {
    if (provider === 'gemini') {
      result = await GeminiService.generateGenericJSON(userContent, systemPrompt, { maxRetries, retryDelay, generationParams });
    } else {
      // Resolve API key from phaseConfig first, then fall back to SettingsService
      const resolvedApiKey = apiKey || (externalProvider ? SettingsService.getApiKey(externalProvider) : '');
      const resolvedBaseUrl = customBaseUrl || SettingsService.getCustomBaseUrl();

      result = await ExternalApiService.callExternalApi({
        provider: externalProvider,
        apiKey: resolvedApiKey,
        model: model,
        customBaseUrl: resolvedBaseUrl,
        systemPrompt: systemPrompt,
        userPrompt: userContent,
        signal: signal,
        maxRetries,
        retryDelay,
        generationParams
      });
    }

    const duration = Date.now() - startTime;
    logger.log("✅ Success Payload:", result);
    logger.log(`⏱️ Duration: ${duration}ms`);
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

export const orchestrateDeepReasoning = async (
  params: DeepOrchestrationParams
): Promise<SynthLogItem> => {
  const { input, config, signal, maxRetries, retryDelay, onPhaseComplete, generationParams } = params;

  // Storage for the full history of each step
  const deepTrace: Record<string, { model: string; input: string; output: any; timestamp: string; duration: number }> = {};

  logger.group("🚀 STARTING DEEP REASONING ORCHESTRATION");
  logger.log("Seed:", input);

  try {
    // 1. Parallel Execution of Phase 0, 1, 2
    const metaPromise = executePhase(config.phases.meta, input, signal, maxRetries, retryDelay, generationParams)
      .then(res => {
        onPhaseComplete?.('meta');
        deepTrace.meta = { model: res.model, input: res.input, output: res.result, timestamp: res.timestamp, duration: res.duration };
        return res.result;
      });

    const retrievalPromise = executePhase(config.phases.retrieval, input, signal, maxRetries, retryDelay, generationParams)
      .then(res => {
        onPhaseComplete?.('retrieval');
        deepTrace.retrieval = { model: res.model, input: res.input, output: res.result, timestamp: res.timestamp, duration: res.duration };
        return res.result;
      });

    const derivationPromise = executePhase(config.phases.derivation, input, signal, maxRetries, retryDelay, generationParams)
      .then(res => {
        onPhaseComplete?.('derivation');
        deepTrace.derivation = { model: res.model, input: res.input, output: res.result, timestamp: res.timestamp, duration: res.duration };
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

    // 3. Execute Writer Phase
    const writerRes = await executePhase(
      config.phases.writer,
      aggregatedContext,
      signal,
      maxRetries,
      retryDelay,
      generationParams
    );

    deepTrace.writer = { model: writerRes.model, input: writerRes.input, output: writerRes.result, timestamp: writerRes.timestamp, duration: writerRes.duration };
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
`;
      const rewriterRes = await executePhase(
        config.phases.rewriter,
        rewriterInput,
        signal,
        maxRetries,
        retryDelay,
        generationParams
      );

      deepTrace.rewriter = { model: rewriterRes.model, input: rewriterRes.input, output: rewriterRes.result, timestamp: rewriterRes.timestamp, duration: rewriterRes.duration };
      onPhaseComplete?.('rewriter');

      if (rewriterRes.result && rewriterRes.result.answer) {
        // Overwrite the original answer with the rewritten one
        writerResult.answer = rewriterRes.result.answer;
      } else if (typeof rewriterRes.result === 'string') {
        // Fallback if rewriter output string directly
        writerResult.answer = rewriterRes.result;
      }
    } else {
      // Use Derivation result as the answer if Rewriter is disabled
      writerResult.answer = derivationResult.conclusion_preview || "See reasoning trace for details.";
    }

    // Set Query from Meta Result
    writerResult.query = metaResult.intent || "Refined Query";

    logger.groupEnd();

    // 5. Return formatted log item
    const finalLogItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: input.substring(0, 150) + "...",
      full_seed: input,
      query: writerResult.query || "Inferred Query",
      reasoning: writerResult.reasoning || "Writer failed to generate reasoning.",
      answer: writerResult.answer || "Writer failed to generate answer.",
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
    provider: 'gemini' | 'external';
    externalProvider: string;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    systemPrompt: string;
  };
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
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
  const { initialInput, initialQuery, initialResponse: preGeneratedResponse, initialReasoning: preGeneratedReasoning, userAgentConfig, responderConfig, signal, maxRetries, retryDelay, generationParams } = params;
  const startTime = Date.now();

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
    displayQuery = initialInput.substring(0, 300) + (initialInput.length > 300 ? "..." : "");
  }

  const messages: ChatMessage[] = [];

  // Helper to format assistant content with <think> tags
  const formatAssistantContent = (answer: string, reasoning?: string): string => {
    if (reasoning && reasoning.trim()) {
      return `<think>${reasoning}</think>\n\n${answer}`;
    }
    return answer;
  };

  logger.group("🔄 STARTING MULTI-TURN CONVERSATION ORCHESTRATION");
  logger.log("Initial Input:", initialInput.substring(0, 100) + "...");
  logger.log("Follow-up Count:", userAgentConfig.followUpCount);
  logger.log("Using pre-generated response:", !!preGeneratedResponse);

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
        responderConfig,
        initialInput,
        DEEP_PHASE_PROMPTS.responder,
        signal,
        maxRetries,
        retryDelay,
        generationParams
      );
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
          systemPrompt: userAgentConfig.systemPrompt || DEEP_PHASE_PROMPTS.userAgent
        },
        userAgentInput,
        userAgentConfig.systemPrompt || DEEP_PHASE_PROMPTS.userAgent,
        signal,
        maxRetries,
        retryDelay,
        generationParams
      );

      const followUpQuestion = followUpResult.follow_up_question || followUpResult.question || "Could you elaborate further?";

      messages.push({
        role: 'user',
        content: followUpQuestion
      });

      // Generate response to follow-up
      // System prompt is passed separately via callAgent, so user input only needs conversation context
      const responseInput = `Previous conversation:\n${conversationContext}\n\n[USER]: ${followUpQuestion}\n\nProvide a detailed response using symbolic reasoning (→, ↺, ∴, !, ●, ◐, ○).\n\nOutput valid JSON only:\n{\n  "reasoning": "[Stenographic trace with symbols]",\n  "answer": "[Final comprehensive answer]"\n}`;
      const responseResult = await callAgent(
        responderConfig,
        responseInput,
        responderConfig.systemPrompt || DEEP_PHASE_PROMPTS.responder,
        signal,
        maxRetries,
        retryDelay,
        generationParams
      );

      messages.push({
        role: 'assistant',
        content: formatAssistantContent(responseResult.answer || responseResult.reasoning || "Response generated.", responseResult.reasoning),
        reasoning: responseResult.reasoning
      });
    }

    logger.log("✅ Multi-turn conversation complete. Total turns:", messages.length);
    logger.groupEnd();

    // Build final log item
    const logItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: displayQuery.substring(0, 150) + (displayQuery.length > 150 ? "..." : ""),
      full_seed: initialInput,
      query: initialQuery,
      reasoning: messages.filter(m => m.role === 'assistant').map(m => m.reasoning).filter(Boolean).join('\n---\n'),
      answer: messages[messages.length - 1]?.content || "",
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      tokenCount: messages.reduce((acc, m) => acc + Math.round((m.content?.length || 0) / 4), 0),
      modelUsed: `MULTI: ${responderConfig.model}`,
      isMultiTurn: true,
      messages: messages
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
      messages: messages
    };
  }
};

// Helper function to call an agent (Gemini or External)
const callAgent = async (
  config: {
    provider: 'gemini' | 'external';
    externalProvider: string;
    apiKey: string;
    model: string;
    customBaseUrl: string;
    systemPrompt: string;
  },
  userContent: string,
  systemPrompt: string,
  signal?: AbortSignal,
  maxRetries = 3,
  retryDelay = 2000,
  generationParams?: GenerationParams
): Promise<any> => {
  if (config.provider === 'gemini') {
    return await GeminiService.generateGenericJSON(userContent, systemPrompt, { maxRetries, retryDelay, generationParams });
  } else {
    return await ExternalApiService.callExternalApi({
      provider: config.externalProvider as any,
      apiKey: config.apiKey,
      model: config.model,
      customBaseUrl: config.customBaseUrl,
      systemPrompt: systemPrompt,
      userPrompt: userContent,
      signal,
      maxRetries,
      retryDelay,
      generationParams
    });
  }
};
