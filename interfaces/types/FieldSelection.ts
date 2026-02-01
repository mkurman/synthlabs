import { OutputField } from './PromptSchema';
import { OutputFieldName } from '../enums/OutputFieldName';
import { PromptCategory } from '../enums/PromptCategory';
import { PromptRole } from '../enums/PromptRole';

/**
 * Represents the state of field selection for a specific prompt
 */
export interface FieldSelectionState {
  /** The prompt set identifier */
  promptSetId: string;
  /** The prompt category (generator, converter, verifier) */
  category: PromptCategory;
  /** The specific role within the category */
  role: PromptRole;
  /** Set of selected field names */
  selectedFields: Set<OutputFieldName>;
  /** All available fields from the schema */
  availableFields: OutputField[];
}

/**
 * Configuration for field selection passed to generation functions
 */
export interface FieldSelectionConfig {
  /** Array of field names that should be generated */
  selectedFields: OutputFieldName[];
  /** Whether to use field selection (if false, all fields are generated) */
  enabled: boolean;
}

/**
 * Result of merging generated fields with existing item data
 */
export interface FieldMergeResult {
  /** The merged data object */
  data: Record<string, any>;
  /** Fields that were selected but not found in the response */
  missingFields: string[];
  /** Fields that were preserved from existing data */
  preservedFields: string[];
}
