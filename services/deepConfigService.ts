import { DeepConfig, DeepPhaseConfig, UserAgentConfig } from '../types';
import { ProviderType } from '../interfaces/enums';

/**
 * Update a single phase configuration in DeepConfig
 * Returns a new DeepConfig object (immutable update)
 */
export function updateDeepPhase(
    config: DeepConfig,
    phase: keyof DeepConfig['phases'],
    updates: Partial<DeepPhaseConfig>
): DeepConfig {
    return {
        ...config,
        phases: {
            ...config.phases,
            [phase]: { ...config.phases[phase], ...updates }
        }
    };
}

/**
 * Copy configuration from one phase to all other phases
 * Returns a new DeepConfig object (immutable update)
 */
export function copyDeepConfigToAll(
    config: DeepConfig,
    sourcePhase: keyof DeepConfig['phases']
): DeepConfig {
    const source = config.phases[sourcePhase];
    const newPhases = { ...config.phases };
    
    (Object.keys(newPhases) as Array<keyof DeepConfig['phases']>).forEach(key => {
        newPhases[key] = {
            ...newPhases[key],
            provider: source.provider,
            externalProvider: source.externalProvider,
            apiKey: source.apiKey,
            model: source.model,
            customBaseUrl: source.customBaseUrl
        };
    });
    
    return { ...config, phases: newPhases };
}

/**
 * Apply phase configuration to UserAgentConfig
 * Returns a new UserAgentConfig object (immutable update)
 */
export function applyPhaseToUserAgent(
    userAgentConfig: UserAgentConfig,
    phaseConfig: DeepPhaseConfig
): UserAgentConfig {
    return {
        ...userAgentConfig,
        provider: phaseConfig.provider,
        externalProvider: phaseConfig.externalProvider,
        apiKey: phaseConfig.apiKey,
        model: phaseConfig.model,
        customBaseUrl: phaseConfig.customBaseUrl
    };
}

/**
 * Get a specific phase configuration
 */
export function getPhaseConfig(
    config: DeepConfig,
    phase: keyof DeepConfig['phases']
): DeepPhaseConfig {
    return config.phases[phase];
}

/**
 * Check if all phases are enabled
 */
export function areAllPhasesEnabled(config: DeepConfig): boolean {
    return Object.values(config.phases).every(phase => phase.enabled);
}

/**
 * Check if any phase is enabled
 */
export function isAnyPhaseEnabled(config: DeepConfig): boolean {
    return Object.values(config.phases).some(phase => phase.enabled);
}

/**
 * Toggle a phase's enabled state
 * Returns a new DeepConfig object (immutable update)
 */
export function togglePhaseEnabled(
    config: DeepConfig,
    phase: keyof DeepConfig['phases']
): DeepConfig {
    return updateDeepPhase(config, phase, { enabled: !config.phases[phase].enabled });
}

/**
 * Reset all phases to use Gemini provider
 * Returns a new DeepConfig object (immutable update)
 */
export function resetPhasesToGemini(config: DeepConfig): DeepConfig {
    const newPhases = { ...config.phases };
    
    (Object.keys(newPhases) as Array<keyof DeepConfig['phases']>).forEach(key => {
        newPhases[key] = {
            ...newPhases[key],
            provider: ProviderType.Gemini,
            model: 'gemini-2.0-flash-exp'
        };
    });
    
    return { ...config, phases: newPhases };
}
