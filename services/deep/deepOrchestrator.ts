import { DeepConfig, SynthLogItem, GenerationParams, ProviderType } from '../../types';
import { DeepPhase, OutputFieldName } from '../../interfaces/enums';
import { logger } from '../../utils/logger';
import { executePhase, getModelName, truncatePreview, toPreviewString, PHASE_TO_SCHEMA } from './phaseExecutor';
import { JSON_OUTPUT_FALLBACK } from '../../constants';

export interface DeepOrchestrationParams {
  input: string;
  originalQuery?: string;
  expectedAnswer?: string;
  config: DeepConfig;
  signal?: AbortSignal;
  maxRetries: number;
  retryDelay: number;
  generationParams?: GenerationParams;
  onPhaseComplete?: (phase: string) => void;
  structuredOutput?: boolean;
  stream?: boolean;
  onStreamChunk?: import('../../types').StreamChunkCallback;
}

export const orchestrateDeepReasoning = async (
  params: DeepOrchestrationParams
): Promise<SynthLogItem> => {
  const { input, originalQuery, expectedAnswer, config, signal, maxRetries, retryDelay, onPhaseComplete, generationParams, structuredOutput, stream, onStreamChunk } = params;

  const cleanQuery = originalQuery || input;
  const deepTrace: Record<string, { model: string; input: string; output: any; timestamp: string; duration: number }> = {};

  logger.group("🚀 STARTING DEEP REASONING ORCHESTRATION");
  logger.log("Seed:", input);

  try {
    // 1. Parallel Execution of Phase 0, 1, 2
    const metaPromise = executePhase(config.phases.meta, input, signal, maxRetries, retryDelay, config.phases.meta.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('meta');
        deepTrace.meta = { model: res.model, input: truncatePreview(res.input), output: toPreviewString(res.result), timestamp: res.timestamp, duration: res.duration };
        return res.result;
      });

    const retrievalPromise = executePhase(config.phases.retrieval, input, signal, maxRetries, retryDelay, config.phases.retrieval.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('retrieval');
        deepTrace.retrieval = { model: res.model, input: truncatePreview(res.input), output: toPreviewString(res.result), timestamp: res.timestamp, duration: res.duration };
        return res.result;
      });

    const derivationPromise = executePhase(config.phases.derivation, input, signal, maxRetries, retryDelay, config.phases.derivation.generationParams || generationParams, structuredOutput)
      .then(res => {
        onPhaseComplete?.('derivation');
        deepTrace.derivation = { model: res.model, input: truncatePreview(res.input), output: toPreviewString(res.result), timestamp: res.timestamp, duration: res.duration };
        return res.result;
      });

    const [metaResult, retrievalResult, derivationResult] = await Promise.all([metaPromise, retrievalPromise, derivationPromise]);

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

    // 3. Execute Writer Phase
    const writerRes = await executePhase(
      config.phases.writer,
      aggregatedContext,
      signal,
      maxRetries,
      retryDelay,
      config.phases.writer.generationParams || generationParams,
      true,
      stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'writer' } : undefined
    );

    deepTrace.writer = { model: writerRes.model, input: truncatePreview(writerRes.input), output: toPreviewString(writerRes.result), timestamp: writerRes.timestamp, duration: writerRes.duration };
    onPhaseComplete?.('writer');

    let writerResult = writerRes.result;

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
CRITICAL: " + ${JSON_OUTPUT_FALLBACK} + " Format: { "answer": "Your final refined answer string here" }
`;
      const rewriterRes = await executePhase(
        config.phases.rewriter,
        rewriterInput,
        signal,
        maxRetries,
        retryDelay,
        config.phases.rewriter.generationParams || generationParams,
        true,
        stream && onStreamChunk ? { stream: true, onStreamChunk, streamPhase: 'rewriter' } : undefined
      );

      deepTrace.rewriter = { model: rewriterRes.model, input: truncatePreview(rewriterRes.input), output: toPreviewString(rewriterRes.result), timestamp: rewriterRes.timestamp, duration: rewriterRes.duration };
      onPhaseComplete?.('rewriter');

      let newAnswer = "";
      if (rewriterRes.result) {
        if (typeof rewriterRes.result === 'string') {
          newAnswer = rewriterRes.result;
        } else if (typeof rewriterRes.result === 'object') {
          const normalized = Object.keys(rewriterRes.result).reduce((acc, key) => {
            acc[key.toLowerCase()] = rewriterRes.result[key];
            return acc;
          }, {} as Record<string, any>);
          newAnswer = normalized.answer || normalized.response || normalized.content || normalized.text || normalized.res || normalized.output || "";
        }
      }

      if (newAnswer && newAnswer.trim().length > 0) {
        writerResult.answer = newAnswer.trim();
        logger.log("✅ Rewriter successfully refined the answer", newAnswer.substring(0, 50) + "...");
      } else {
        logger.warn("⚠️ Rewriter returned empty or invalid format, keeping original answer.");
      }
    }

    writerResult.query = cleanQuery.trim();
    logger.groupEnd();

    const writerSchema = config.phases.writer.promptSchema || PHASE_TO_SCHEMA[DeepPhase.Writer]?.();
    const schemaOutputFields = writerSchema?.output?.map(f => f.name) || [];
    const schemaDefinesAnswer = schemaOutputFields.includes(OutputFieldName.Answer);
    
    let finalAnswer: string;
    if (schemaDefinesAnswer) {
      if (!writerResult.answer) {
        throw new Error(`[WRITER] Schema requires '${OutputFieldName.Answer}' field but model did not produce it.`);
      }
      finalAnswer = writerResult.answer;
    } else {
      finalAnswer = expectedAnswer || "";
    }
    
    const finalLogItem: SynthLogItem = {
      id: crypto.randomUUID(),
      seed_preview: cleanQuery.substring(0, 150) + "...",
      full_seed: cleanQuery,
      query: cleanQuery.trim(),
      reasoning: writerResult.reasoning || "Writer failed to generate reasoning.",
      answer: finalAnswer,
      timestamp: new Date().toISOString(),
      modelUsed: `DEEP: ${config.phases.writer.model}`,
      provider: config.phases.writer.provider === ProviderType.Gemini ? ProviderType.Gemini : config.phases.writer.externalProvider,
      deepMetadata: {
        meta: getModelName(config.phases.meta),
        retrieval: getModelName(config.phases.retrieval),
        derivation: getModelName(config.phases.derivation),
        writer: getModelName(config.phases.writer),
        rewriter: config.phases.rewriter?.enabled ? getModelName(config.phases.rewriter) : undefined
      },
      deepTrace: deepTrace
    };

    return finalLogItem;

  } catch (error: any) {
    logger.error("💥 ORCHESTRATION FATAL ERROR:", error);
    logger.groupEnd();

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
      deepTrace: deepTrace as any
    };
  }
};
