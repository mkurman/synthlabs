import { OutputFieldName } from '../enums/OutputFieldName';

export interface OutputField {
  name: OutputFieldName;
  description: string;
  optional?: boolean;
}

export interface PromptSchema {
  prompt: string;
  output: OutputField[];
}

export interface ParsedSchemaOutput {
  data: Record<string, any>;
  missingFields: string[];
  isValid: boolean;
  error?: string;
}
