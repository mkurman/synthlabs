export interface OutputField {
  name: string;
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
