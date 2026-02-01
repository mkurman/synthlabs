export enum PromptRole {
  // Generator roles
  System = 'system',
  Meta = 'meta',
  Retrieval = 'retrieval',
  Derivation = 'derivation',
  Responder = 'responder',
  UserAgent = 'user_agent',
  
  // Converter roles
  Writer = 'writer',
  Rewriter = 'rewriter',
  
  // Verifier roles
  QueryRewrite = 'query_rewrite',
  AnswerRewrite = 'answer_rewrite',
  MessageRewrite = 'message_rewrite',
  ReasoningRewrite = 'reasoning_rewrite',
  Autoscore = 'autoscore'
}
