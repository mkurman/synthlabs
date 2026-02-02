/**
 * Session Service
 * 
 * Manages session persistence, save/load operations, and cloud sync.
 * Handles serialization/deserialization of application state.
 */

import { logger } from '../utils/logger';
import * as FirebaseService from './firebaseService';
import { PromptService } from './promptService';
import {
    SessionData,
    SessionConfig,
    NewSessionConfig,
    SessionSetters,
    CloudSessionResult
} from '../interfaces/services/SessionConfig';
import {
    CreatorMode,
    Environment,
    ProviderType,
    ExternalProvider,
    DataSource,
    DeepPhase,
    PromptCategory,
    PromptRole
} from '../interfaces/enums';
import { DeepConfig } from '../types';
import { SessionStatus } from '../interfaces';
import { StorageMode } from '../interfaces/enums/StorageMode';

// Current session format version
const SESSION_VERSION = 2;

/**
 * Default configuration for missing rewriter phase (backward compatibility).
 */
const DEFAULT_REWRITER_CONFIG = {
    id: DeepPhase.Rewriter,
    enabled: false,
    provider: ProviderType.Gemini,
    externalProvider: ExternalProvider.OpenRouter,
    apiKey: '',
    model: 'gemini-3-flash-preview',
    customBaseUrl: '',
    systemPrompt: '', // Will be populated from PromptService
    structuredOutput: true
};

/**
 * SessionService provides methods for managing application sessions.
 */
export const SessionService = {
    buildSessionConfig(config: SessionConfig): SessionConfig {
        return {
            ...config,
            generationParams: config.generationParams || {}
        };
    },
    /**
     * Serialize current session state to SessionData format.
     * 
     * @param config - Current session configuration
     * @param sessionUid - Current session UID
     * @returns SessionData object ready for serialization
     */
    getSessionData(config: SessionConfig, sessionUid: string): SessionData {
        return {
            id: this.generateLocalUid(),
            status: SessionStatus.Idle,
            storageMode: config.environment === Environment.Production ? StorageMode.Cloud : StorageMode.Local,
            name: this.generateSessionName(config.appMode),
            updatedAt: Date.now(),
            itemCount: 0,
            version: SESSION_VERSION,
            createdAt: new Date().toISOString(),
            sessionUid: sessionUid,
            config: config
        };
    },

    /**
     * Restore session state from saved data.
     * Handles version migration (e.g., backfilling rewriter phase).
     * 
     * @param session - Saved session data (partial, from JSON)
     * @param savedSessionUid - Optional session UID from cloud
     * @param setters - React state setters for restoring configuration
     * @param callbacks - Additional callbacks for session restoration
     * @returns void
     */
    restoreSession(
        session: Partial<SessionData>,
        savedSessionUid: string | undefined,
        setters: SessionSetters,
        callbacks: { setSessionUid?: (uid: string) => void; setError?: (error: string | null) => void }
    ): void {
        try {
            // Restore sessionUid if provided (for cloud sessions)
            if (savedSessionUid && callbacks.setSessionUid) {
                callbacks.setSessionUid(savedSessionUid);
            }

            if (session.config) {
                const c = session.config;

                // Restore each configuration field if present
                if (c.appMode !== undefined) setters.setAppMode(c.appMode);
                if (c.engineMode !== undefined) setters.setEngineMode(c.engineMode);
                if (c.environment !== undefined) setters.setEnvironment(c.environment);
                if (c.provider !== undefined) setters.setProvider(c.provider);
                if (c.externalProvider !== undefined) setters.setExternalProvider(c.externalProvider);
                if (c.externalApiKey !== undefined) setters.setExternalApiKey(c.externalApiKey);
                if (c.externalModel !== undefined) setters.setExternalModel(c.externalModel);
                if (c.customBaseUrl !== undefined) setters.setCustomBaseUrl(c.customBaseUrl);

                if (c.deepConfig) {
                    // Backfill missing rewriter phase for older sessions
                    const mergedDeepConfig = this.backfillRewriterPhase(c.deepConfig);
                    setters.setDeepConfig(mergedDeepConfig);
                }

                if (c.userAgentConfig !== undefined) {
                    setters.setUserAgentConfig(c.userAgentConfig);
                }

                if (c.concurrency !== undefined) setters.setConcurrency(c.concurrency);
                if (c.rowsToFetch !== undefined) setters.setRowsToFetch(c.rowsToFetch);
                if (c.skipRows !== undefined) setters.setSkipRows(c.skipRows);
                if (c.sleepTime !== undefined) setters.setSleepTime(c.sleepTime);
                if (c.maxRetries !== undefined) setters.setMaxRetries(c.maxRetries);
                if (c.retryDelay !== undefined) setters.setRetryDelay(c.retryDelay);
                if (c.feedPageSize !== undefined) setters.setFeedPageSize(c.feedPageSize);
                if (c.dataSourceMode !== undefined) setters.setDataSourceMode(c.dataSourceMode);
                if (c.hfConfig !== undefined) setters.setHfConfig(c.hfConfig);
                if (c.geminiTopic !== undefined) setters.setGeminiTopic(c.geminiTopic);
                if (c.topicCategory !== undefined) setters.setTopicCategory(c.topicCategory);
                if (c.systemPrompt !== undefined) setters.setSystemPrompt(c.systemPrompt);
                if (c.converterPrompt !== undefined) setters.setConverterPrompt(c.converterPrompt);
                if (c.conversationRewriteMode !== undefined) setters.setConversationRewriteMode(c.conversationRewriteMode);
                if (c.converterInputText !== undefined) setters.setConverterInputText(c.converterInputText);
                if (c.generationParams !== undefined) {
                    setters.setGenerationParams(c.generationParams);
                }

                // Clear any error
                if (callbacks.setError) {
                    callbacks.setError(null);
                }
            }
        } catch (err) {
            logger.error("Failed to restore session", err);
            if (callbacks.setError) {
                callbacks.setError("Failed to restore session data.");
            }
        }
    },

    /**
     * Backfill missing rewriter phase in deep config for backward compatibility.
     * 
     * @param deepConfig - Deep configuration from saved session
     * @returns DeepConfig with rewriter phase added if missing
     */
    backfillRewriterPhase(deepConfig: DeepConfig): DeepConfig {
        const mergedDeepConfig = { ...deepConfig };

        if (!mergedDeepConfig.phases.rewriter) {
            mergedDeepConfig.phases.rewriter = {
                ...DEFAULT_REWRITER_CONFIG,
                systemPrompt: PromptService.getPrompt(PromptCategory.Converter, PromptRole.Rewriter)
            };
        }

        return mergedDeepConfig;
    },

    /**
     * Save session to local file.
     * 
     * @param sessionData - Session data to save
     * @param filename - Optional custom filename
     */
    saveToFile(sessionData: SessionData, filename?: string): void {
        const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = filename || `synth_session_${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Load session from local file.
     * 
     * @param file - File object from file input
     * @returns Promise resolving to SessionData
     */
    async loadFromFile(file: File): Promise<SessionData> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    if (typeof event.target?.result === 'string') {
                        const session = JSON.parse(event.target.result) as SessionData;
                        resolve(session);
                    } else {
                        reject(new Error('Failed to read file content'));
                    }
                } catch (err) {
                    reject(new Error('Invalid JSON format'));
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsText(file);
        });
    },

    /**
     * Save session to Firebase cloud.
     * 
     * @param sessionData - Session data to save
     * @param name - Session name
     * @returns Promise resolving when complete
     */
    async saveToCloud(sessionData: SessionData, name: string): Promise<void> {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured');
        }

        await FirebaseService.saveSessionToFirebase(sessionData, name);
    },

    /**
     * Load session from Firebase cloud.
     * 
     * @param sessionId - Firebase session document ID
     * @returns Promise resolving to CloudSessionResult
     */
    async loadFromCloud(sessionId: string): Promise<CloudSessionResult> {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured');
        }

        const result = await FirebaseService.loadFromCloud(sessionId);

        if (!result) {
            throw new Error('Session not found');
        }

        return result;
    },

    /**
     * Delete session from Firebase cloud.
     * 
     * @param sessionId - Firebase session document ID
     * @returns Promise resolving when complete
     */
    async deleteFromCloud(sessionId: string): Promise<void> {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured');
        }

        await FirebaseService.deleteSessionFromFirebase(sessionId);
    },

    /**
     * List all cloud sessions from Firebase.
     * 
     * @returns Promise resolving to array of SavedSession
     */
    async listCloudSessions(): Promise<SessionData[]> {
        if (!FirebaseService.isFirebaseConfigured()) {
            throw new Error('Firebase not configured');
        }

        return await FirebaseService.getSessionsFromFirebase();
    },

    /**
     * Check if Firebase is configured.
     * 
     * @returns boolean
     */
    isCloudAvailable(): boolean {
        return FirebaseService.isFirebaseConfigured();
    },

    /**
     * Start a new session, optionally creating in Firebase.
     * 
     * @param config - Configuration for new session
     * @param getSessionData - Function to get current session data
     * @returns Promise resolving to new session UID
     */
    async startNewSession(
        config: NewSessionConfig,
        getSessionData: () => SessionData
    ): Promise<string> {
        const sourceLabel = this.getSourceLabel(config);
        let newUid: string;

        if (config.environment === Environment.Production && FirebaseService.isFirebaseConfigured()) {
            try {
                const sessionName = this.generateSessionName(config.appMode);
                const sessionConfig = getSessionData();
                newUid = await FirebaseService.createSessionInFirebase(sessionName, sourceLabel, sessionConfig);
                logger.log(`Created new Firebase session: ${newUid}`);
            } catch (e) {
                logger.warn("Failed to create Firebase session, using local UUID", e);
                newUid = this.generateLocalUid();
            }
        } else {
            newUid = this.generateLocalUid();
        }

        return newUid;
    },

    /**
     * Generate a human-readable source label for the session.
     * 
     * @param config - New session configuration
     * @returns Source label string
     */
    getSourceLabel(config: NewSessionConfig): string {
        switch (config.dataSourceMode) {
            case DataSource.HuggingFace:
                return `hf:${config.hfConfig.dataset}`;
            case DataSource.Manual:
                return `manual:${config.manualFileName || 'unknown'}`;
            case DataSource.Synthetic:
                return 'synthetic';
            default:
                return 'unknown';
        }
    },

    /**
     * Generate a session name based on mode and timestamp.
     * 
     * @param appMode - Current application mode
     * @returns Generated session name
     */
    generateSessionName(appMode: CreatorMode): string {
        const modeLabel = appMode === CreatorMode.Generator ? 'Generation' : 'Conversion';
        return `${modeLabel} - ${new Date().toLocaleString()}`;
    },

    /**
     * Generate a local UUID (fallback when Firebase is unavailable).
     * 
     * @returns UUID string
     */
    generateLocalUid(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
};

export default SessionService;
