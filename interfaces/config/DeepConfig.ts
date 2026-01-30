import { DeepPhaseConfig } from './DeepPhaseConfig';

export interface DeepConfig {
  phases: {
    meta: DeepPhaseConfig;
    retrieval: DeepPhaseConfig;
    derivation: DeepPhaseConfig;
    writer: DeepPhaseConfig;
    rewriter: DeepPhaseConfig;
  };
}
