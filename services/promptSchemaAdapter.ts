
/**
 * Prompt Schema Adapter
 * 
 * This module connects the PromptService (YAML-based structured prompts)
 * with the AI service layer. It provides utilities to:
 * 1. Convert PromptSchema to API-compatible JSON schemas
 * 2. Validate and parse responses against schemas
 * 3. Handle missing required fields by marking items as ERROR
 */

import { PromptSchema, ParsedSchemaOutput, OutputField } from '../types';
import { JSON_OUTPUT_FALLBACK } from '../constants';
import { PromptService } from './promptService';
import { PromptCategory, PromptRole, OutputFieldName, ResponsesSchemaName } from '../interfaces/enums';
import { filterFieldsBySelection } from './fieldSelectionService';

/**
 * Convert PromptSchema output fields to OpenAI-compatible JSON schema
 * Only non-optional fields are added to the 'required' array
 * 
 * @param outputFields - All output fields from schema
 * @param selectedFields - Optional array of field names to include (if provided, only these fields are used)
 * @returns OpenAI-compatible JSON schema
 */
export function toOpenAIJsonSchema(outputFields: OutputField[], selectedFields?: OutputFieldName[]): Record<string, any> {
    // Filter fields if selection is provided
    const fieldsToUse = selectedFields && selectedFields.length > 0
        ? filterFieldsBySelection(outputFields, selectedFields)
        : outputFields;
    
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of fieldsToUse) {
        properties[field.name] = {
            type: 'string',
            description: field.description
        };
        // Only add to required if field is not optional
        if (!field.optional) {
            required.push(field.name);
        }
    }

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: true
    };
}

/**
 * Convert PromptSchema output fields to Gemini-compatible schema format
 * Only non-optional fields are added to the 'required' array
 *
 * @param outputFields - All output fields from schema
 * @param selectedFields - Optional array of field names to include (if provided, only these fields are used)
 * @returns Gemini-compatible JSON schema
 */
export function toGeminiSchema(outputFields: OutputField[], selectedFields?: OutputFieldName[]): Record<string, any> {
    // Filter fields if selection is provided
    const fieldsToUse = selectedFields && selectedFields.length > 0
        ? filterFieldsBySelection(outputFields, selectedFields)
        : outputFields;

    // Gemini uses a different format with Type enum
    // This will be used with the GoogleGenAI SDK
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of fieldsToUse) {
        properties[field.name] = {
            type: 'string',
            description: field.description
        };
        // Only add to required if field is not optional
        if (!field.optional) {
            required.push(field.name);
        }
    }

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: true
    };
}

/**
 * Get the schema name for Responses API based on output fields
 * Returns a ResponsesSchemaName that maps to RESPONSES_API_SCHEMAS
 */
export function getResponsesSchemaName(
    outputFields: OutputField[]
): ResponsesSchemaName {
    const fieldNames = outputFields.map(f => f.name).sort();
    const fieldSet = new Set(fieldNames);

    // Check for known schema patterns
    if (fieldSet.has(OutputFieldName.FollowUpQuestion) || fieldSet.has(OutputFieldName.Question)) {
        return ResponsesSchemaName.UserAgentResponse;
    }

    if (fieldSet.has(OutputFieldName.Response) && fieldNames.length === 1) {
        return ResponsesSchemaName.RewriteResponse;
    }

    if (fieldSet.has(OutputFieldName.Reasoning) && fieldSet.has(OutputFieldName.Answer)) {
        if (fieldSet.has(OutputFieldName.FollowUpQuestion) || fieldSet.has(OutputFieldName.Query)) {
            return ResponsesSchemaName.ReasoningTraceWithFollowUp;
        }
        return ResponsesSchemaName.ReasoningTrace;
    }

    // Default to generic object for unknown schemas
    return ResponsesSchemaName.GenericObject;
}

/**
 * Get full prompt data including schema for a prompt
 */
export function getPromptWithSchema(
    category: PromptCategory,
    role: PromptRole,
    forceSetId?: string
): { prompt: string; schema: PromptSchema; jsonSchema: Record<string, any> | null } {
    const schema = PromptService.getPromptSchema(category, role, forceSetId);
    
    let jsonSchema: Record<string, any> | null = null;
    if (schema.output && schema.output.length > 0) {
        jsonSchema = toOpenAIJsonSchema(schema.output);
    }

    return {
        prompt: schema.prompt,
        schema,
        jsonSchema
    };
}

/**
 * Parse and validate a response against a prompt schema
 * Returns the filtered data and marks missing required fields
 * Optional fields that are missing are not counted as errors
 */
export function parseAndValidateResponse(
    response: string | Record<string, any>,
    promptSchema: PromptSchema
): ParsedSchemaOutput {
    try {
        // Parse the response if it's a string
        let parsedData: Record<string, any>;
        if (typeof response === 'string') {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();
            parsedData = JSON.parse(jsonStr);
        } else {
            parsedData = response;
        }

        // Filter to only include fields defined in schema
        const filteredData: Record<string, any> = {};
        const missingFields: string[] = [];

        for (const field of promptSchema.output) {
            if (field.name in parsedData) {
                filteredData[field.name] = parsedData[field.name];
            } else if (!field.optional) {
                // Field is missing and it's required (optional: false or undefined)
                missingFields.push(field.name);
            }
        }

        return {
            data: filteredData,
            missingFields,
            isValid: missingFields.length === 0
        };
    } catch (error: any) {
        return {
            data: {},
            missingFields: promptSchema.output.filter(f => !f.optional).map(f => f.name),
            isValid: false,
            error: `Failed to parse response: ${error?.message || 'Unknown error'}`
        };
    }
}

/**
 * Parse response using category/role to look up the schema
 * Convenience wrapper around parseAndValidateResponse
 */
export function parseResponseWithSchema(
    category: PromptCategory,
    role: PromptRole,
    response: string | Record<string, any>,
    forceSetId?: string
): ParsedSchemaOutput {
    const schema = PromptService.getPromptSchema(category, role, forceSetId);
    return parseAndValidateResponse(response, schema);
}

/**
 * Create an error result object for when parsing fails
 * Only required (non-optional) fields are listed as missing
 */
export function createErrorResult(
    schema: PromptSchema,
    errorMessage: string
): ParsedSchemaOutput {
    return {
        data: {},
        missingFields: schema.output.filter(f => !f.optional).map(f => f.name),
        isValid: false,
        error: errorMessage
    };
}

/**
 * Get expected output fields description for use in prompts
 * This can be appended to system prompts to help the model understand expected output
 */
export function getOutputDescription(schema: PromptSchema): string {
    if (!schema.output || schema.output.length === 0) {
        return '';
    }

    const lines = ['\n\nExpected JSON Output Format:'];
    lines.push('{');
    for (const field of schema.output) {
        lines.push(`  "${field.name}": "${field.description}",`);
    }
    lines.push('}');

    return lines.join('\n');
}

/**
 * Generate JSON output instruction for when structured output is disabled
 * This provides the model with the expected schema format
 */
export function getJsonOutputInstruction(schema: PromptSchema, format: 'compact' | 'pretty' = 'compact'): string {
    if (!schema.output || schema.output.length === 0) {
        return '\n\n' + JSON_OUTPUT_FALLBACK;
    }

    // Build a simple example object from the schema
    const example: Record<string, string> = {};
    for (const field of schema.output) {
        example[field.name] = field.description.substring(0, 50) + (field.description.length > 50 ? '...' : '');
    }

    if (format === 'pretty') {
        return '\n\nOutput valid JSON only:\n' + JSON.stringify(example, null, 2);
    } else {
        return '\n\nOutput valid JSON only: ' + JSON.stringify(example);
    }
}

/**
 * Get the final system prompt with optional JSON instruction
 * 
 * @param category - Prompt category
 * @param role - Prompt role
 * @param forceSetId - Optional prompt set override
 * @param structuredOutput - Whether structured output is enabled (if false, appends JSON instruction)
 * @returns Object with systemPrompt, schema, and jsonSchema
 */
export function getEnhancedPrompt(
    category: PromptCategory,
    role: PromptRole,
    forceSetId?: string,
    structuredOutput: boolean = true
): { systemPrompt: string; schema: PromptSchema; jsonSchema: Record<string, any> | null } {
    const { prompt, schema, jsonSchema } = getPromptWithSchema(category, role, forceSetId);
    
    // If structured output is disabled, append JSON instruction
    if (!structuredOutput) {
        const jsonInstruction = getJsonOutputInstruction(schema, 'compact');
        return {
            systemPrompt: prompt + jsonInstruction,
            schema,
            jsonSchema
        };
    }

    // With structured output enabled, just return the clean prompt
    // The API will handle the schema via response_format or text.format
    return {
        systemPrompt: prompt,
        schema,
        jsonSchema
    };
}
