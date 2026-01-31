import { OutputField } from '../interfaces/types/PromptSchema';
import { FieldMergeResult } from '../interfaces/types/FieldSelection';
import { OutputFieldName, SynthLogFieldName } from '../interfaces/enums';
import { SynthLogItem } from '../interfaces/models/SynthLogItem';

/**
 * Get default field selection (all non-optional fields)
 * 
 * @param fields - Array of output fields from schema
 * @returns Array of field names that are required (non-optional)
 */
export function getDefaultFieldSelection(fields: OutputField[]): string[] {
  return fields
    .filter(field => !field.optional)
    .map(field => field.name);
}

/**
 * Filter output fields by selection
 * Returns only the fields that are in the selectedFields array
 * 
 * @param outputFields - All available fields from schema
 * @param selectedFields - Array of field names to include
 * @returns Filtered array of OutputField
 */
export function filterFieldsBySelection(
  outputFields: OutputField[],
  selectedFields: OutputFieldName[]
): OutputField[] {
  const selectedSet = new Set(selectedFields);
  return outputFields.filter(field => selectedSet.has(field.name));
}

/**
 * Check if field selection is enabled (i.e., not all fields are selected)
 * 
 * @param outputFields - All available fields
 * @param selectedFields - Currently selected fields
 * @returns True if selection is active (not all fields selected)
 */
export function isFieldSelectionActive(
  outputFields: OutputField[],
  selectedFields: OutputFieldName[]
): boolean {
  if (!selectedFields || selectedFields.length === 0) {
    return false;
  }
  return selectedFields.length !== outputFields.length;
}

/**
 * Get fields that should be preserved from existing data
 * These are fields that exist in the schema but are not selected for generation
 * 
 * @param outputFields - All available fields
 * @param selectedFields - Fields selected for generation
 * @returns Array of field names to preserve from existing data
 */
export function getFieldsToPreserve(
  outputFields: OutputField[],
  selectedFields: OutputFieldName[]
): OutputFieldName[] {
  const selectedSet = new Set(selectedFields);
  return outputFields
    .filter(field => !selectedSet.has(field.name))
    .map(field => field.name);
}

/**
 * Merge generated fields with existing item data
 * Used in converter mode to preserve unselected fields from original item
 * 
 * @param existingItem - The original SynthLogItem with existing values
 * @param generatedData - The data returned from the model
 * @param selectedFields - Fields that were selected for generation
 * @param outputFields - All fields defined in the schema
 * @returns Merged result with generated and preserved fields
 */
export function mergeWithExistingFields(
  existingItem: Partial<SynthLogItem>,
  generatedData: Record<string, any>,
  selectedFields: OutputFieldName[],
  outputFields: OutputField[]
): FieldMergeResult {
  const selectedSet = new Set(selectedFields);
  const result: Record<string, any> = {};
  const missingFields: string[] = [];
  const preservedFields: string[] = [];

  // Process all schema fields
  for (const field of outputFields) {
    const fieldName = field.name;

    if (selectedSet.has(fieldName)) {
      // Field was selected for generation
      if (fieldName in generatedData) {
        // Use generated value
        result[fieldName] = generatedData[fieldName];
      } else {
        // Field was selected but not in response - mark as missing
        missingFields.push(fieldName);
        // Try to use existing value as fallback
        const existingValue = getExistingFieldValue(existingItem, fieldName);
        if (existingValue !== undefined) {
          result[fieldName] = existingValue;
          preservedFields.push(fieldName);
        } else {
          result[fieldName] = '';
        }
      }
    } else {
      // Field was not selected - preserve from existing
      const existingValue = getExistingFieldValue(existingItem, fieldName);
      if (existingValue !== undefined) {
        result[fieldName] = existingValue;
        preservedFields.push(fieldName);
      } else {
        // No existing value - use empty string
        result[fieldName] = '';
      }
    }
  }

  // Include any extra fields from generated data that aren't in schema
  for (const [key, value] of Object.entries(generatedData)) {
    if (!(key in result)) {
      result[key] = value;
    }
  }

  return {
    data: result,
    missingFields,
    preservedFields
  };
}

/**
 * Get field value from existing SynthLogItem
 * Handles special field mappings (e.g., original_reasoning -> reasoning)
 * 
 * @param existingItem - The existing item
 * @param fieldName - Name of the field to retrieve
 * @returns The field value or undefined
 */
function getExistingFieldValue(
  existingItem: Partial<SynthLogItem>,
  fieldName: string
): any {
  // Direct field access
  if (fieldName in existingItem) {
    return (existingItem as Record<string, any>)[fieldName];
  }

  // Special mappings for converter mode
  const mappings: Record<string, keyof SynthLogItem> = {
    [OutputFieldName.Reasoning]: SynthLogFieldName.OriginalReasoning,
    [OutputFieldName.Answer]: SynthLogFieldName.OriginalAnswer
  };

  const mappedField = mappings[fieldName];
  if (mappedField && mappedField in existingItem) {
    return existingItem[mappedField];
  }

  return undefined;
}

/**
 * Create a filtered schema for API calls
 * Returns a schema with only the selected fields
 * 
 * @param fullSchema - The complete schema with all fields
 * @param selectedFields - Fields to include
 * @returns Filtered schema
 */
export function createFilteredSchema(
  fullSchema: { output: OutputField[] },
  selectedFields: OutputFieldName[]
): { output: OutputField[] } {
  return {
    output: filterFieldsBySelection(fullSchema.output, selectedFields)
  };
}
