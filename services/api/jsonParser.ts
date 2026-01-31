import { logger } from '../../utils/logger';
import { jsonrepair } from 'json-repair-js';

export function parseJsonContent(content: string): any {
  let cleanContent = content.trim();

  // 1. Try to extract JSON from markdown code blocks
  const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      cleanContent = extracted;
    }
  } else {
    // 2. Fallback: try to strip leading ```json and trailing ```
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent
        .replace(/^```json\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();
    }
  }

  // 3. Try direct parse
  try {
    const parsed = JSON.parse(cleanContent);
    // Handle double-encoded JSON
    if (typeof parsed === 'string') {
      try {
        const doubleParsed = JSON.parse(parsed);
        if (typeof doubleParsed === 'object' && doubleParsed !== null) {
          return doubleParsed;
        }
        cleanContent = parsed;
        throw new Error("Parsed as string, forcing extraction");
      } catch (e) {
        cleanContent = parsed;
        throw new Error("Parsed as string, forcing extraction");
      }
    }
    return parsed;
  } catch (e) {
    // 4. Try to find the first valid { ... } object or [ ... ] array
    const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = cleanContent.match(/\[[\s\S]*\]/);

    if (jsonArrayMatch) {
      try {
        return JSON.parse(jsonArrayMatch[0]);
      } catch (e2) {
        // Fall through
      }
    }

    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch (e2) {
        // Fall through
      }
    }

    // 5. Try JSONL format
    const lines = cleanContent.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
      const jsonlResults: any[] = [];
      let allParsed = true;
      for (const line of lines) {
        try {
          jsonlResults.push(JSON.parse(line.trim()));
        } catch {
          allParsed = false;
          break;
        }
      }
      if (allParsed && jsonlResults.length > 0) {
        return jsonlResults.length === 1 ? jsonlResults[0] : jsonlResults;
      }
    }

    // 6. Try to repair the JSON
    try {
      const repaired = jsonrepair(cleanContent);
      logger.log("JSON repaired successfully");
      return JSON.parse(repaired);
    } catch (repairError) {
      const matchToRepair = jsonArrayMatch || jsonObjectMatch;
      if (matchToRepair) {
        try {
          const repairedMatch = jsonrepair(matchToRepair[0]);
          logger.log("JSON object/array repaired successfully");
          return JSON.parse(repairedMatch);
        } catch {
          // Fall through
        }
      }
    }

    // Fallback: wrap raw text
    console.warn("JSON Parse Failed, using raw text as fallback", e);
    return {
      answer: content.trim(),
      reasoning: "",
      follow_up_question: content.trim()
    };
  }
}
