import { GoogleGenAI, Type } from "@google/genai";
import { GenerationParams } from "../types";
import { logger } from '../utils/logger';

// Ensure API Key exists
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  generationParams?: GenerationParams;
  model?: string;
}

const callGeminiWithRetry = async (
  apiCall: () => Promise<any>,
  options: RetryOptions = { maxRetries: 3, retryDelay: 2000 }
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

  // 1. Try to extract JSON from markdown code blocks
  const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleanContent = codeBlockMatch[1].trim();
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

export const optimizeSystemPrompt = async (currentPrompt: string): Promise<string> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const optimizationPrompt = `You are a prompt engineering expert for LLMs. 
  Refine the following "System Rubric" to be stricter about "Stenographic Reasoning" (using symbols like →, ↺, ∴, ●) and JSON output format.
  Make the instructions concise but powerful. Ensure the entropy markers <H≈...> are enforced.
  
  Current Rubric:
  ${currentPrompt}
  
  Output ONLY the refined prompt text.`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: optimizationPrompt,
    }));
    return response.text || currentPrompt;
  } catch (error) {
    console.error("Optimization Error", error);
    throw error;
  }
};

export const generateSyntheticSeeds = async (topic: string, count: number, model?: string): Promise<string[]> => {
  if (!API_KEY) throw new Error("Missing Gemini API Key in environment.");

  const seedPrompt = `Generate ${count} DISTINCT, high-quality, factual text paragraphs about: "${topic}". 
  They should be suitable for testing an AI's reasoning capabilities. 
  
  Output format must be a JSON array of strings: ["Text 1...", "Text 2..."].
  Style: Encyclopedia or Academic Abstract.`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
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
  retryOptions?: RetryOptions
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
