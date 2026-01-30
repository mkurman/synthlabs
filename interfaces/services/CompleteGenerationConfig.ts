import { GenerationConfig } from '../config/GenerationConfig';
import { GenerationCallbacks } from '../callbacks/GenerationCallbacks';
import { GenerationRefs } from '../refs/GenerationRefs';
import { GenerationFunctions } from '../functions/GenerationFunctions';

/**
 * Complete generation service configuration
 * Combines base config, callbacks, refs, and functions needed by GenerationService
 */
export type CompleteGenerationConfig = GenerationConfig & GenerationCallbacks & GenerationRefs & GenerationFunctions;
