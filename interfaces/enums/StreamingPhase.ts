export enum StreamingPhase {
  Idle = 'idle',
  WaitingForResponse = 'waiting_for_response',
  ExtractingReasoning = 'extracting_reasoning',
  ExtractingAnswer = 'extracting_answer',
  MessageComplete = 'message_complete',
  Complete = 'complete',
  Error = 'error'
}
