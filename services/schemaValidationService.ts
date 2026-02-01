import { OutputFieldName, ALLOWED_OUTPUT_FIELD_NAMES } from '../interfaces/enums/OutputFieldName';
import { toast } from './toastService';

export interface SchemaValidationResult {
  isValid: boolean;
  validFields: OutputFieldName[];
  invalidFields: string[];
  warnings: string[];
}

/**
 * Validate schema output fields against allowed field names
 * Shows toast warning for invalid fields but continues with valid ones
 * 
 * @param schemaName - Name of the schema for error messages
 * @param fieldNames - Array of field names from the schema
 * @returns Validation result with valid/invalid fields separated
 */
export function validateSchemaFields(
  schemaName: string,
  fieldNames: string[]
): SchemaValidationResult {
  const validFields: OutputFieldName[] = [];
  const invalidFields: string[] = [];
  const warnings: string[] = [];

  for (const fieldName of fieldNames) {
    if (ALLOWED_OUTPUT_FIELD_NAMES.has(fieldName)) {
      validFields.push(fieldName as OutputFieldName);
    } else {
      invalidFields.push(fieldName);
      warnings.push(`Field "${fieldName}" is not a recognized output field`);
    }
  }

  // Show toast warning if there are invalid fields
  if (invalidFields.length > 0) {
    const warningMessage = `Schema "${schemaName}" has ${invalidFields.length} incompatible field(s): ${invalidFields.join(', ')}. Only valid fields will be used.`;
    toast.warning(warningMessage, 5000);
    
    console.warn(`[SchemaValidation] ${warningMessage}`, {
      schemaName,
      invalidFields,
      validFields,
      allowedFields: Array.from(ALLOWED_OUTPUT_FIELD_NAMES)
    });
  }

  return {
    isValid: invalidFields.length === 0,
    validFields,
    invalidFields,
    warnings
  };
}

/**
 * Cast field names to OutputFieldName enum values
 * Filters out invalid fields
 * 
 * @param fieldNames - Array of field name strings
 * @returns Array of valid OutputFieldName enum values
 */
export function castToOutputFieldNames(fieldNames: string[]): OutputFieldName[] {
  return fieldNames.filter((name): name is OutputFieldName => 
    ALLOWED_OUTPUT_FIELD_NAMES.has(name)
  );
}

/**
 * Check if a field name is a valid output field
 */
export function isValidOutputField(fieldName: string): boolean {
  return ALLOWED_OUTPUT_FIELD_NAMES.has(fieldName);
}
