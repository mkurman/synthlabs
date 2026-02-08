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
  /** When true, ignore schema and parse native model output */
  useNativeOutput?: boolean;
  /** When true, split generation into separate sequential plain-text requests per field */
  splitFieldRequests?: boolean;
}
