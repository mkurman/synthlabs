/**
 * Enum for output field names used in prompt schemas
 * This ensures type safety and prevents string literal typos
 */
export enum OutputFieldName {
  // Core fields
  Query = 'query',
  Reasoning = 'reasoning',
  Answer = 'answer',
  ReasoningContent = 'reasoning_content',
  
  // Verifier fields
  Response = 'response',
  Score = 'score',
  
  // Generator phase fields
  Facts = 'facts',
  Constraints = 'constraints',
  Entities = 'entities',
  Intent = 'intent',
  Domain = 'domain',
  Complexity = 'complexity',
  Traps = 'traps',
  Steps = 'steps',
  ConclusionPreview = 'conclusion_preview',
  FollowUpQuestion = 'follow_up_question',
  Question = 'question',
  
  // Legacy/Alternative fields
  Content = 'content',
  Text = 'text'
}

/**
 * Set of allowed output field names for validation
 */
export const ALLOWED_OUTPUT_FIELD_NAMES: Set<string> = new Set([
  OutputFieldName.Query,
  OutputFieldName.Reasoning,
  OutputFieldName.Answer,
  OutputFieldName.ReasoningContent,
  OutputFieldName.Response,
  OutputFieldName.Score,
  OutputFieldName.Facts,
  OutputFieldName.Constraints,
  OutputFieldName.Entities,
  OutputFieldName.Intent,
  OutputFieldName.Domain,
  OutputFieldName.Complexity,
  OutputFieldName.Traps,
  OutputFieldName.Steps,
  OutputFieldName.ConclusionPreview,
  OutputFieldName.FollowUpQuestion,
  OutputFieldName.Question,
  OutputFieldName.Content,
  OutputFieldName.Text
]);

/**
 * Check if a field name is a valid output field
 */
export function isValidOutputFieldName(fieldName: string): fieldName is OutputFieldName {
  return ALLOWED_OUTPUT_FIELD_NAMES.has(fieldName);
}

/**
 * Validate schema fields and return invalid field names
 */
