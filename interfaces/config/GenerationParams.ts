import { OutputFieldName } from '../enums/OutputFieldName';

export interface GenerationParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  forceStructuredOutput?: boolean;
  /** Array of field names to generate (undefined = generate all schema fields) */
  selectedFields?: OutputFieldName[];
}
