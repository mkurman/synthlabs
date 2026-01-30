import { GoogleGenAI, Type } from "@google/genai";
import { GenerationParams } from "../types";
import { logger } from '../utils/logger';
import { callExternalApi, ExternalApiConfig } from './externalApiService';

// Ensure API Key exists
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Update to allow runtime key injection
export const getGeminiClient = (overrideKey?: string) => {
  if (overrideKey) return new GoogleGenAI({ apiKey: overrideKey });
  return ai;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  generationParams?: GenerationParams;
  model?: string;
  structuredOutput?: boolean;
}

const callGeminiWithRetry = async (
  apiCall: () => Promise<any>,
  options: RetryOptions = { maxRetries: 3, retryDelay: 2000, structuredOutput: true }
) => {
  const { maxRetries = 3, retryDelay = 2000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      // Check for 429 or 503 (Service Unavailable)
      const isRateLimit = error?.status === 429 || error?.message?.includes('429');
      const isServerErr = error?.status >= 500;

      if ((isRateLimit || isServerErr) && attempt < maxRetries) {
        const backoff = retryDelay * Math.pow(2, attempt);
        logger.warn(`Gemini Attempt ${attempt + 1} failed. Retrying in ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
};

function cleanAndParseJSON(text: string | undefined): any {
  if (!text) return {};

  let cleanContent = text.trim();
 
  //1. Try to extract JSON from markdown code blocks (only at start of content)
  // Validate that extracted content looks like JSON to avoid matching ``` markers inside string values
  const codeBlockMatch = cleanContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const extracted = codeBlockMatch[1].trim();
    const trimmedExtracted = extracted.replace(/^[\s\n\r]+/, '');
    // Only use the extracted content if it looks like valid JSON (starts with { and ends with })
    // This prevents issues when the model returns ``` markers inside JSON string values
    if (trimmedExtracted.startsWith('{') && trimmedExtracted.endsWith('}')) {
      cleanContent = extracted;
    } else {
      // Extracted doesn't look like valid JSON (probably matched inner ``` inside a string)
      // Fall back to stripping of ``` wrapper manually
      cleanContent = cleanContent
        .replace(/^```json\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
    }
  } else {
    // 2. Fallback: try to strip leading ```json and trailing ```
    cleanContent = cleanContent
      .replace(/^```json\s*/, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  // 3. Try direct parse
  try {
    return JSON.parse(cleanContent);
  } catch (e) {
    // 4. Try to find the first valid { ... } object in the text
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Fall through
      }
    }

    logger.warn("JSON Parse Warning, returning raw text or empty object", e);
    // Return empty object or fallback if expected
    return {};
  }
}

// ... (existing generateGeminiTopic)

export const generateContentStream = async (
  prompt: string,
  model: string,
  onChunk: (chunk: string, accumulated: string) => void,
  abortSignal?: AbortSignal
): Promise<string> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key");

  try {
    const result = await ai.models.generateContentStream({
      model: model,
      contents: prompt,
    });

    let accumulated = '';
    for await (const chunk of result) {
      if (abortSignal?.aborted) {
        throw new Error('Aborted by user');
      }
      const text = chunk.text;
      if (typeof text === 'string' && text) {
        accumulated += text;
        onChunk(text, accumulated);
      }
    }
    return accumulated;
  } catch (error) {
    console.error("Gemini Streaming Error", error);
    throw error;
  }
};

export const generateGeminiTopic = async (category: string, model?: string): Promise<string> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const prompt = `Generate a single, specific, complex, and academically rich topic for a research paper in the domain of "${category}".
  Examples:
  - "The socio-economic impact of the Black Death on late medieval agrarian structures"
  - "Quantum entanglement applications in cryptographic key distribution protocols"
  
  Output ONLY the topic text. Keep it under 15 words. No quotes.`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: model || 'gemini-2.0-flash-exp',
      contents: prompt,
    }));
    return response.text?.trim() || "Advanced Artificial Intelligence";
  } catch (error) {
    console.error("Topic Gen Error", error);
    throw error;
  }
};

export interface OptimizePromptConfig {
  provider: 'gemini' | 'external';
  externalProvider?: string;
  model?: string;
  customBaseUrl?: string;
  apiKey?: string;
  structuredOutput?: boolean
}

export const optimizeSystemPrompt = async (
  currentPrompt: string,
  config?: OptimizePromptConfig
): Promise<string> => {
  const optimizationPrompt = `You are a prompt engineering expert for LLMs.
  Refine following "System Rubric" to be stricter about "Stenographic Reasoning" (using symbols like →, ↺, ∴, ●) and JSON output format.
  Make instructions concise but powerful. Ensure entropy markers <H≈...> are enforced.`

  const userInput = `Please optimize the system prompt below.

  ----------------------------
  Current Rubric:
  ${currentPrompt}

  ----------------------------
  
  Output ONLY refined prompt as a text.`;

  if (config?.provider === 'external') {
    if (!config.externalProvider || !config.model || !config.apiKey) {
      throw new Error(`External provider config incomplete. Provider: ${config.externalProvider}, Model: ${config.model}, Has API Key: ${!!config.apiKey}`);
    }
    try {
      const externalConfig: ExternalApiConfig = {
        provider: config.externalProvider as any,
        apiKey: config.apiKey,
        model: config.model,
        customBaseUrl: config.customBaseUrl,
        systemPrompt: optimizationPrompt,
        userPrompt: userInput,
        maxRetries: 3,
        retryDelay: 2000,
        structuredOutput: config?.structuredOutput
      };
      const result = await callExternalApi(externalConfig);
      return result || currentPrompt;
    } catch (error) {
      console.error("External API Optimization Error", error);
      throw error;
    }
  }

  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: config?.model || 'gemini-3-flash-preview',
      contents: optimizationPrompt,
    }));
    return response.text || currentPrompt;
  } catch (error) {
    console.error("Optimization Error", error);
    throw error;
  }
};

export const generateSyntheticSeeds = async (topic: string, count: number, model?: string, apiKey?: string): Promise<string[]> => {
  if (!API_KEY && !apiKey) throw new Error("Missing Gemini API Key in environment or settings.");

  const seedPrompt = `Generate ${count} DISTINCT, high-quality, factual text paragraphs about: "${topic}". 
  They should be suitable for testing an AI's reasoning capabilities. 
  
  Output format must be a JSON array of strings: ["Text 1...", "Text 2..."].
  Style: Encyclopedia or Academic Abstract.`;

  try {
    const client = getGeminiClient(apiKey);
    const response = await callGeminiWithRetry(() => client.models.generateContent({
      model: model || 'gemini-2.0-flash-exp',
      contents: seedPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));

    const parsed = cleanAndParseJSON(response.text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Seed Gen Error", error);
    return [];
  }
};

export const generateReasoningTrace = async (
  seedText: string,
  systemPrompt: string,
  retryOptions?: RetryOptions
): Promise<{ query: string; reasoning: string; answer: string }> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const userMessage = `[SEED TEXT START]\n${seedText}\n[SEED TEXT END]`;

  const genConfig: any = {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING },
        reasoning: { type: Type.STRING },
        answer: { type: Type.STRING }
      },
      required: ["query", "reasoning", "answer"]
    }
  };

  if (retryOptions?.generationParams) {
    if (retryOptions.generationParams.temperature !== undefined) genConfig.temperature = retryOptions.generationParams.temperature;
    if (retryOptions.generationParams.topP !== undefined) genConfig.topP = retryOptions.generationParams.topP;
    if (retryOptions.generationParams.topK !== undefined) genConfig.topK = retryOptions.generationParams.topK;
    if (retryOptions.generationParams.presencePenalty !== undefined) genConfig.presencePenalty = retryOptions.generationParams.presencePenalty;
    if (retryOptions.generationParams.frequencyPenalty !== undefined) genConfig.frequencyPenalty = retryOptions.generationParams.frequencyPenalty;
  }

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: retryOptions?.model || 'gemini-2.0-flash-exp',
      contents: userMessage,
      config: genConfig
    }), retryOptions);

    const result = cleanAndParseJSON(response.text);
    return {
      query: result.query || "Error parsing query",
      reasoning: result.reasoning || "Error parsing reasoning",
      answer: result.answer || "Error parsing answer"
    };

  } catch (error) {
    console.error("Reasoning Trace Gen Error", error);
    throw error;
  }
};

export const generateGenericJSON = async (
  input: string,
  systemPrompt: string,
  retryOptions?: RetryOptions,
): Promise<any> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const genConfig: any = {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json'
  };

  if (retryOptions?.generationParams) {
    if (retryOptions.generationParams.temperature !== undefined) genConfig.temperature = retryOptions.generationParams.temperature;
    if (retryOptions.generationParams.topP !== undefined) genConfig.topP = retryOptions.generationParams.topP;
    if (retryOptions.generationParams.topK !== undefined) genConfig.topK = retryOptions.generationParams.topK;
    if (retryOptions.generationParams.presencePenalty !== undefined) genConfig.presencePenalty = retryOptions.generationParams.presencePenalty;
    if (retryOptions.generationParams.frequencyPenalty !== undefined) genConfig.frequencyPenalty = retryOptions.generationParams.frequencyPenalty;
  }

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: retryOptions?.model || 'gemini-2.0-flash-exp',
      contents: input,
      config: genConfig
    }), retryOptions);

    return cleanAndParseJSON(response.text);
  } catch (error) {
    console.error("Generic JSON Gen Error", error);
    throw error;
  }
};

export const convertReasoningTrace = async (
  inputText: string,
  systemPrompt: string,
  retryOptions?: RetryOptions
): Promise<{ query: string; reasoning: string; answer: string }> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const userMessage = `[INPUT LOGIC START]\n${inputText}\n[INPUT LOGIC END]`;

  const genConfig: any = {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING },
        reasoning: { type: Type.STRING },
        answer: { type: Type.STRING }
      },
      required: ["query", "reasoning", "answer"]
    }
  };

  if (retryOptions?.generationParams) {
    if (retryOptions.generationParams.temperature !== undefined) genConfig.temperature = retryOptions.generationParams.temperature;
    if (retryOptions.generationParams.topP !== undefined) genConfig.topP = retryOptions.generationParams.topP;
    if (retryOptions.generationParams.topK !== undefined) genConfig.topK = retryOptions.generationParams.topK;
    if (retryOptions.generationParams.presencePenalty !== undefined) genConfig.presencePenalty = retryOptions.generationParams.presencePenalty;
    if (retryOptions.generationParams.frequencyPenalty !== undefined) genConfig.frequencyPenalty = retryOptions.generationParams.frequencyPenalty;
  }

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: retryOptions?.model || 'gemini-2.0-flash-exp',
      contents: userMessage,
      config: genConfig
    }), retryOptions);

    const result = cleanAndParseJSON(response.text);
    return {
      query: result.query || "Inferred Query",
      reasoning: result.reasoning || "Error parsing reasoning",
      answer: result.answer || "Error parsing answer"
    };

  } catch (error) {
    console.error("Reasoning Conversion Error", error);
    throw error;
  }
};
