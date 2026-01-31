import { logger } from '../../utils/logger';
import { jsonrepair } from 'json-repair-js';

import { OutputFieldName } from '../../interfaces/enums/OutputFieldName';

export interface ParseJsonOptions {
  /** Array of field names that must be present in the response */
  requiredFields?: OutputFieldName[];
}

export class MissingFieldsError extends Error {
  constructor(public missingFields: string[], public parsedData: any) {
    super(`Missing required fields: ${missingFields.join(', ')}`);
    this.name = 'MissingFieldsError';
  }
}

export function parseJsonContent(content: string, options?: ParseJsonOptions): any {
  let cleanContent = content.trim();
  let parsed: any;

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
    parsed = JSON.parse(cleanContent);
    // Handle double-encoded JSON
    if (typeof parsed === 'string') {
      try {
        const doubleParsed = JSON.parse(parsed);
        if (typeof doubleParsed === 'object' && doubleParsed !== null) {
          parsed = doubleParsed;
        } else {
          cleanContent = parsed;
          throw new Error("Parsed as string, forcing extraction");
        }
      } catch (e) {
        cleanContent = parsed;
        throw new Error("Parsed as string, forcing extraction");
      }
    }
  } catch (e) {
    // 4. Try to find the first valid { ... } object or [ ... ] array
    const jsonObjectMatch = cleanContent.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = cleanContent.match(/\[[\s\S]*\]/);

    if (jsonArrayMatch) {
      try {
        parsed = JSON.parse(jsonArrayMatch[0]);
      } catch (e2) {
        // Fall through
      }
    }

    if (!parsed && jsonObjectMatch) {
      try {
        parsed = JSON.parse(jsonObjectMatch[0]);
      } catch (e2) {
        // Fall through
      }
    }

    // 5. Try JSONL format
    if (!parsed) {
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
          parsed = jsonlResults.length === 1 ? jsonlResults[0] : jsonlResults;
        }
      }
    }

    // 6. Try to repair the JSON
    if (!parsed) {
      try {
        const repaired = jsonrepair(cleanContent);
        logger.log("JSON repaired successfully");
        parsed = JSON.parse(repaired);
      } catch (repairError) {
        const matchToRepair = jsonArrayMatch || jsonObjectMatch;
        if (matchToRepair) {
          try {
            const repairedMatch = jsonrepair(matchToRepair[0]);
            logger.log("JSON object/array repaired successfully");
            parsed = JSON.parse(repairedMatch);
          } catch {
            // Fall through
          }
        }
      }
    }

    // Fallback: wrap raw text
    if (!parsed) {
      console.warn("JSON Parse Failed, using raw text as fallback", e);
      parsed = {
        answer: content.trim(),
        reasoning: "",
        follow_up_question: content.trim()
      };
    }
  }

  // Validate required fields if specified
  if (options?.requiredFields && options.requiredFields.length > 0) {
    const missingFields = options.requiredFields.filter(field => !(field in parsed));
    if (missingFields.length > 0) {
      throw new MissingFieldsError(missingFields, parsed);
    }
  }

  return parsed;
}
