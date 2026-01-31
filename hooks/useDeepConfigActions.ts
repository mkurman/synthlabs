import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { updateDeepPhase as updateDeepPhaseService, copyDeepConfigToAll as copyDeepConfigToAllService, applyPhaseToUserAgent } from '../services/deepConfigService';
import type { DeepConfig, DeepPhaseConfig, UserAgentConfig } from '../types';

interface UseDeepConfigActionsOptions {
    deepConfig: DeepConfig;
    setDeepConfig: Dispatch<SetStateAction<DeepConfig>>;
    setUserAgentConfig: Dispatch<SetStateAction<UserAgentConfig>>;
}

export function useDeepConfigActions({
    deepConfig,
    setDeepConfig,
    setUserAgentConfig
}: UseDeepConfigActionsOptions) {
    const updateDeepPhase = useCallback((phase: keyof DeepConfig['phases'], updates: Partial<DeepPhaseConfig>) => {
        setDeepConfig(prev => updateDeepPhaseService(prev, phase, updates));
    }, [setDeepConfig]);

    const copyDeepConfigToAll = useCallback((sourcePhase: keyof DeepConfig['phases']) => {
        const source = deepConfig.phases[sourcePhase];
        setDeepConfig(prev => copyDeepConfigToAllService(prev, sourcePhase));
        setUserAgentConfig(prev => applyPhaseToUserAgent(prev, source));
    }, [deepConfig.phases, setDeepConfig, setUserAgentConfig]);

    return { updateDeepPhase, copyDeepConfigToAll };
}

export default useDeepConfigActions;
