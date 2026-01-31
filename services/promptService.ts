
import { SettingsService } from './settingsService';
import { JSON_OUTPUT_FALLBACK } from '../constants';
import { PromptSchema, OutputField, ParsedSchemaOutput } from '../types';
import { PromptCategory, PromptRole } from '../interfaces/enums';
import { validateSchemaFields } from './schemaValidationService';
import YAML from 'js-yaml';

// Use import.meta.glob to load all prompt yaml files
const promptFiles = import.meta.glob('/prompts/**/*.yaml', { query: '?raw', import: 'default', eager: true });

// Load metadata files
const metaFiles = import.meta.glob('/prompts/**/meta.json', { eager: true });

export interface PromptSetMetadata {
    name: string;
    description: string;
    author?: string;
    version?: string;
    symbols?: string[];
    format?: string;
    features?: string[];
    extends?: string;  // Parent prompt set to inherit from
}

/**
 * Parse a YAML prompt file content into a PromptSchema object.
 * Falls back to a basic schema if parsing fails.
 */
function parsePromptYaml(content: string, path: string): PromptSchema {
    try {
        const parsed = YAML.load(content) as Partial<PromptSchema>;
        
        // Validate required fields
        if (!parsed.prompt || typeof parsed.prompt !== 'string') {
            throw new Error(`Missing or invalid 'prompt' field in ${path}`);
        }
        
        if (!parsed.output || !Array.isArray(parsed.output)) {
            throw new Error(`Missing or invalid 'output' field in ${path}`);
        }

        // Validate output fields
        const output: OutputField[] = parsed.output.map((field: any, index: number) => {
            if (!field.name || typeof field.name !== 'string') {
                throw new Error(`Output field ${index} missing 'name' in ${path}`);
            }
            return {
                name: field.name as OutputField['name'],
                description: field.description || '',
                optional: field.optional ?? false
            };
        });

        // Validate schema fields against allowed field names
        const fieldNames = output.map(f => f.name);
        const validationResult = validateSchemaFields(path, fieldNames);
        
        // Filter output to only include valid fields
        const validOutput = output.filter(f => validationResult.validFields.includes(f.name));

        return {
            prompt: parsed.prompt,
            output: validOutput
        };
    } catch (error) {
        console.error(`[PromptService] Failed to parse YAML at ${path}:`, error);
        // Return a fallback schema that marks itself as invalid
        return {
            prompt: content, // Use raw content as prompt
            output: []
        };
    }
}

/**
 * Convert output fields to a JSON Schema object structure.
 * This can be used with APIs that support response_format or json_schema.
 */
export function outputFieldsToJsonSchema(outputFields: OutputField[]): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const field of outputFields) {
        properties[field.name] = {
            type: 'string',
            description: field.description
        };
        // All fields are required by default unless we add optional support later
        required.push(field.name);
    }

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: true // Allow extra fields from model
    };
}

/**
 * Parse a model response against the expected schema.
 * Returns only the fields defined in the schema, marks missing required fields.
 * Optional fields that are missing are not counted as errors.
 */
export function parseSchemaResponse(
    response: string | Record<string, any>,
    schema: PromptSchema
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

        for (const field of schema.output) {
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
            missingFields: schema.output.filter(f => !f.optional).map(f => f.name),
            isValid: false,
            error: `Failed to parse response: ${error?.message || 'Unknown error'}`
        };
    }
}

export const PromptService = {
    /**
     * Helper to get metadata for inheritance chain lookup
     */
    _getMetadataInternal(setId: string): PromptSetMetadata | null {
        const metaPath = `/prompts/${setId}/meta.json`;
        const meta = metaFiles[metaPath];
        if (meta && typeof meta === 'object' && 'default' in meta) {
            return meta.default as PromptSetMetadata;
        }
        if (meta) {
            return meta as PromptSetMetadata;
        }
        return null;
    },

    /**
     * Checks if a prompt set has a meta.json file (not just a fallback).
     * Used to distinguish official prompt sets from user-created ones.
     */
    hasMetaFile(setId: string): boolean {
        const metaPath = `/prompts/${setId}/meta.json`;
        return metaPath in metaFiles;
    },

    /**
     * Retrieves a full prompt schema by category and role.
     * Supports inheritance: if a prompt isn't found in a set, checks parent set (via 'extends'),
     * then falls back to 'default'.
     * NOTE: 'default' is the terminal set and cannot extend anything - any 'extends' in its meta.json is ignored.
     */
    getPromptSchema(category: PromptCategory, role: PromptRole, forceSetId?: string): PromptSchema {
        const setId = forceSetId || SettingsService.getSettings().promptSet || 'default';
        const defaultPath = `/prompts/default/${category}/${role}.yaml`;

        // Build inheritance chain (prevent infinite loops with visited set)
        const visited = new Set<string>();
        let currentSetId: string | undefined = setId;

        while (currentSetId) {
            // Check for circular inheritance
            if (visited.has(currentSetId)) {
                console.warn(`[PromptService] Circular inheritance detected: ${Array.from(visited).join(' -> ')} -> ${currentSetId}`);
                break;
            }
            visited.add(currentSetId);

            // Try current set
            const currentPath = `/prompts/${currentSetId}/${category}/${role}.yaml`;
            if (promptFiles[currentPath]) {
                return parsePromptYaml(promptFiles[currentPath] as string, currentPath);
            }

            // Check for parent via 'extends' in metadata
            if (currentSetId !== 'default') {
                const meta = this._getMetadataInternal(currentSetId);
                if (meta?.extends) {
                    // Warn if the parent set doesn't exist
                    if (!this.hasMetaFile(meta.extends) && meta.extends !== 'default') {
                        console.warn(`[PromptService] Set '${currentSetId}' extends '${meta.extends}' which has no meta.json`);
                    }
                    currentSetId = meta.extends;
                } else {
                    currentSetId = undefined; // No parent, will fall through to default
                }
            } else {
                break; // Reached default, stop
            }
        }

        // Fall back to default
        if (promptFiles[defaultPath]) {
            return parsePromptYaml(promptFiles[defaultPath] as string, defaultPath);
        }

        console.error(`Prompt completely missing: ${category}/${role} (Set: ${setId})`);
        return {
            prompt: '',
            output: []
        };
    },

    /**
     * Retrieves just the prompt text (backward compatibility with old API).
     * @deprecated Use getPromptSchema() instead to get full schema with output specification
     */
    getPrompt(category: PromptCategory, role: PromptRole, forceSetId?: string): string {
        const schema = this.getPromptSchema(category, role, forceSetId);
        return schema.prompt;
    },

    /**
     * Get the expected JSON schema for the model response.
     * This can be sent to APIs that support structured output.
     */
    getResponseSchema(category: PromptCategory, role: PromptRole, forceSetId?: string): Record<string, any> | null {
        const schema = this.getPromptSchema(category, role, forceSetId);
        if (!schema.output || schema.output.length === 0) {
            return null;
        }
        return outputFieldsToJsonSchema(schema.output);
    },

    /**
     * Generate JSON output instruction for when structured output is disabled.
     * This provides the model with the expected schema format as text.
     */
    getJsonOutputInstruction(category: PromptCategory, role: PromptRole, forceSetId?: string, format: 'compact' | 'pretty' = 'compact'): string {
        const schema = this.getPromptSchema(category, role, forceSetId);
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
    },

    /**
     * Get the final system prompt with optional JSON instruction.
     * When structuredOutput is false, appends the JSON format instruction.
     * When structuredOutput is true (default), returns the clean prompt.
     * 
     * @param category - Prompt category
     * @param role - Prompt role  
     * @param forceSetId - Optional prompt set override
     * @param structuredOutput - Whether structured output is enabled via API
     * @returns The system prompt string
     */
    getSystemPrompt(category: PromptCategory, role: PromptRole, forceSetId?: string, structuredOutput: boolean = true): string {
        const schema = this.getPromptSchema(category, role, forceSetId);

        // If structured output is disabled, append JSON instruction
        if (!structuredOutput) {
            const example: Record<string, string> = {};
            for (const field of schema.output || []) {
                // Include all fields in the example, but mark optional ones
                const suffix = field.optional ? ' (optional)' : '';
                example[field.name] = field.description.substring(0, 50) + (field.description.length > 50 ? '...' : '') + suffix;
            }
            return schema.prompt + '\n\nOutput valid JSON only: ' + JSON.stringify(example);
        }

        return schema.prompt;
    },

    /**
     * Parse a model response against the expected schema for a prompt.
     * Returns filtered data and marks items with missing required fields.
     */
    parseResponse(
        category: PromptCategory,
        role: PromptRole,
        response: string | Record<string, any>,
        forceSetId?: string
    ): ParsedSchemaOutput {
        const schema = this.getPromptSchema(category, role, forceSetId);
        return parseSchemaResponse(response, schema);
    },

    /**
     * Discovers all available prompt sets by scanning the directories.
     */
    getAvailableSets(): string[] {
        const sets = new Set<string>();

        Object.keys(promptFiles).forEach(path => {
            // Path format: /prompts/<setId>/<category>/<role>.yaml
            const parts = path.split('/');
            // ["", "prompts", "setId", "category", "file"]
            if (parts.length >= 3 && parts[1] === 'prompts') {
                sets.add(parts[2]);
            }
        });

        return Array.from(sets).sort();
    },

    /**
     * Gets metadata for a specific prompt set.
     */
    getSetMetadata(setId: string): PromptSetMetadata | null {
        return this._getMetadataInternal(setId);
    },

    /**
     * Gets metadata for all available prompt sets.
     */
    getAllMetadata(): Record<string, PromptSetMetadata> {
        const result: Record<string, PromptSetMetadata> = {};
        const sets = this.getAvailableSets();

        for (const setId of sets) {
            const meta = this.getSetMetadata(setId);
            if (meta) {
                result[setId] = meta;
            } else {
                // Provide fallback metadata for sets without meta.json
                result[setId] = {
                    name: setId.charAt(0).toUpperCase() + setId.slice(1),
                    description: `Prompt set: ${setId}`
                };
            }
        }

        return result;
    },

    /**
     * Checks which prompts exist in a set vs the default set.
     */
    getSetCompleteness(setId: string): {
        total: number;
        present: number;
        missing: string[];
    } {
        const defaultPrompts = Object.keys(promptFiles)
            .filter(p => p.startsWith('/prompts/default/'))
            .map(p => p.replace('/prompts/default/', ''));

        const setPrompts = Object.keys(promptFiles)
            .filter(p => p.startsWith(`/prompts/${setId}/`))
            .map(p => p.replace(`/prompts/${setId}/`, ''));

        const missing = defaultPrompts.filter(p => !setPrompts.includes(p));

        return {
            total: defaultPrompts.length,
            present: setPrompts.length,
            missing
        };
    }
};
