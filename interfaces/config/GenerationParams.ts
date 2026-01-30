export interface GenerationParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens?: number;
  forceStructuredOutput?: boolean;
}
