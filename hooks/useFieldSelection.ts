import { useState, useCallback, useEffect, useRef } from 'react';
import { OutputField } from '../interfaces/types/PromptSchema';
import { OutputFieldName } from '../interfaces/enums/OutputFieldName';
import { PromptCategory } from '../interfaces/enums/PromptCategory';
import { PromptRole } from '../interfaces/enums/PromptRole';

interface UseFieldSelectionOptions {
  promptSetId: string;
  category: PromptCategory;
  role: PromptRole;
  outputFields: OutputField[];
  resetOnPromptChange?: boolean;
}

interface UseFieldSelectionReturn {
  /** Array of selected field names */
  selectedFields: OutputFieldName[];
  /** All available fields from the schema */
  availableFields: OutputField[];
  /** Check if a specific field is selected */
  isFieldSelected: (fieldName: OutputFieldName) => boolean;
  /** Toggle a field's selection state */
  toggleField: (fieldName: OutputFieldName) => void;
  /** Select all fields */
  selectAll: () => void;
  /** Deselect all fields */
  deselectAll: () => void;
  /** Reset to default (all non-optional fields selected) */
  resetToDefault: () => void;
  /** Number of selected fields */
  selectedCount: number;
  /** Total number of available fields */
  totalCount: number;
  /** Whether all fields are selected */
  allSelected: boolean;
  /** Whether no fields are selected */
  noneSelected: boolean;
}

/**
 * Get default field selection (all non-optional fields)
 */
function getDefaultFieldSelection(fields: OutputField[]): OutputFieldName[] {
  return fields
    .filter(field => !field.optional)
    .map(field => field.name);
}

/**
 * Compare two arrays of OutputField to check if they're equal
 */
function areFieldsEqual(a: OutputField[], b: OutputField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => 
    field.name === b[index]?.name && 
    field.optional === b[index]?.optional
  );
}

/**
 * Hook for managing field selection state
 * 
 * @param options - Configuration options
 * @returns Field selection state and handlers
 */
export function useFieldSelection({
  promptSetId,
  category,
  role,
  outputFields,
  resetOnPromptChange = true
}: UseFieldSelectionOptions): UseFieldSelectionReturn {
  // Initialize with default selection (all non-optional fields)
  const [selectedFields, setSelectedFields] = useState<OutputFieldName[]>(() => {
    return getDefaultFieldSelection(outputFields);
  });

  // Use refs to track previous values and avoid infinite loops
  const prevPromptSetId = useRef(promptSetId);
  const prevCategory = useRef(category);
  const prevRole = useRef(role);
  const prevOutputFields = useRef(outputFields);

  // Reset selection when prompt changes (if enabled)
  useEffect(() => {
    const promptChanged = 
      prevPromptSetId.current !== promptSetId ||
      prevCategory.current !== category ||
      prevRole.current !== role;
    
    const fieldsChanged = !areFieldsEqual(prevOutputFields.current, outputFields);

    if (resetOnPromptChange && (promptChanged || fieldsChanged)) {
      setSelectedFields(getDefaultFieldSelection(outputFields));
      // Update refs
      prevPromptSetId.current = promptSetId;
      prevCategory.current = category;
      prevRole.current = role;
      prevOutputFields.current = outputFields;
    }
  }, [promptSetId, category, role, resetOnPromptChange, outputFields]);

  const selectedSet = new Set(selectedFields);

  const isFieldSelected = useCallback((fieldName: OutputFieldName): boolean => {
    return selectedSet.has(fieldName);
  }, [selectedSet]);

  const toggleField = useCallback((fieldName: OutputFieldName) => {
    setSelectedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return Array.from(newSet);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedFields(outputFields.map(field => field.name));
  }, [outputFields]);

  const deselectAll = useCallback(() => {
    setSelectedFields([]);
  }, []);

  const resetToDefault = useCallback(() => {
    setSelectedFields(getDefaultFieldSelection(outputFields));
  }, [outputFields]);

  return {
    selectedFields,
    availableFields: outputFields,
    isFieldSelected,
    toggleField,
    selectAll,
    deselectAll,
    resetToDefault,
    selectedCount: selectedFields.length,
    totalCount: outputFields.length,
    allSelected: selectedFields.length === outputFields.length && outputFields.length > 0,
    noneSelected: selectedFields.length === 0
  };
}

export default useFieldSelection;
