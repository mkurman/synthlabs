import type { ExternalApiConfig } from './schemas';
import { callExternalApi } from './callExternalApi';

export const generateSyntheticSeeds = async (
  baseConfig: Omit<ExternalApiConfig, 'userPrompt' | 'systemPrompt'>,
  topic: string,
  count: number
): Promise<string[]> => {
  const prompt = `Generate ${count} DISTINCT, high-quality, factual text paragraphs about: "${topic}".
  The texts should be suitable for testing an AI's reasoning capabilities.
  
  Output format: A raw JSON array of strings. 
  Example: ["Text paragraph 1...", "Text paragraph 2..."].
  Do not include markdown formatting or explanations. Output ONLY the JSON.`;

  try {
    const result = await callExternalApi({
      ...baseConfig,
      userPrompt: "You are a high-fidelity synthetic data generator. You output strict JSON arrays of strings.\n\n" + prompt
    });

    if (Array.isArray(result)) {
      return result.map(String);
    }
    if (result && Array.isArray(result.seeds)) {
      return result.seeds.map(String);
    }
    if (result && Array.isArray(result.paragraphs)) {
      return result.paragraphs.map(String);
    }

    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
        if (parsed && Array.isArray(parsed.seeds)) {
          return parsed.seeds.map(String);
        }
        if (parsed && Array.isArray(parsed.paragraphs)) {
          return parsed.paragraphs.map(String);
        }
      } catch (parseError) {
        console.error("Failed to parse result string as JSON:", parseError);
      }
    }

    if (result && typeof result === 'object' && result.content) {
      try {
        const parsed = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
      } catch (parseError) {
        console.error("Failed to parse result.content:", parseError);
      }
    }

    console.warn("generateSyntheticSeeds: Could not extract array from result:", result);
    return [];
  } catch (e) {
    console.error("External Seed Gen failed", e);
    return [];
  }
};
