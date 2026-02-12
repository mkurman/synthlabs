import { useCallback, useState } from 'react';
import { SettingsService, AppSettings, StepModelConfig, DeepModeDefaults, DEFAULT_WORKFLOW_DEFAULTS } from '../services/settingsService';
import { EngineMode, SettingsPanelTab, ApiSubTab } from '../interfaces/enums';

export interface UseSettingsStateReturn {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    showKeys: Record<string, boolean>;
    saved: boolean;
    setSaved: React.Dispatch<React.SetStateAction<boolean>>;
    isFullscreen: boolean;
    setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
    confirmClear: boolean;
    setConfirmClear: React.Dispatch<React.SetStateAction<boolean>>;
    activeTab: SettingsPanelTab;
    setActiveTab: React.Dispatch<React.SetStateAction<SettingsPanelTab>>;
    apiSubTab: ApiSubTab;
    setApiSubTab: React.Dispatch<React.SetStateAction<ApiSubTab>>;
    expandedSections: Record<string, boolean>;
    setExpandedSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    availablePromptSets: string[];
    setAvailablePromptSets: React.Dispatch<React.SetStateAction<string[]>>;
    promptMetadata: Record<string, { name?: string; description?: string; symbols?: string[]; features?: string[] }>;
    setPromptMetadata: React.Dispatch<React.SetStateAction<Record<string, { name?: string; description?: string; symbols?: string[]; features?: string[] }>>>;
    toggleShowKey: (key: string) => void;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    updateProviderKey: (provider: string, value: string) => void;
    updateDefaultModel: (provider: string, value: string) => void;
    updateWorkflowDefault: (
        workflow: 'generator' | 'converter',
        mode: EngineMode,
        step: keyof DeepModeDefaults | null,
        field: keyof StepModelConfig,
        value: any
    ) => void;
    toggleSection: (section: string) => void;
    handleSave: () => Promise<void>;
    handleClearAll: () => Promise<void>;
    loadSettings: () => void;
}

export function useSettingsState(onSettingsChanged?: () => void): UseSettingsStateReturn {
    const [settings, setSettings] = useState<AppSettings>({ providerKeys: {} });
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saved, setSaved] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsPanelTab>(SettingsPanelTab.Providers);
    const [apiSubTab, setApiSubTab] = useState<ApiSubTab>(ApiSubTab.Keys);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ generalPurpose: true, generator: true, converter: false });
    const [availablePromptSets, setAvailablePromptSets] = useState<string[]>([]);
    const [promptMetadata, setPromptMetadata] = useState<Record<string, { name?: string; description?: string; symbols?: string[]; features?: string[] }>>({});

    const loadSettings = useCallback(() => {
        setSettings(SettingsService.getSettings());
        setSaved(false);
        setConfirmClear(false);
    }, []);

    const handleSave = async () => {
        await SettingsService.saveSettingsAsync(settings);
        setSaved(true);
        onSettingsChanged?.();
        setTimeout(() => setSaved(false), 2000);
    };

    const handleClearAll = async () => {
        if (!confirmClear) {
            setConfirmClear(true);
            return;
        }
        await SettingsService.clearAllData();
        setSettings({ providerKeys: {} });
        setConfirmClear(false);
        onSettingsChanged?.();
        await new Promise(resolve => setTimeout(resolve, 100));
        window.location.reload();
    };

    const toggleShowKey = (key: string) => {
        setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const updateProviderKey = (provider: string, value: string) => {
        setSettings(prev => ({
            ...prev,
            providerKeys: { ...prev.providerKeys, [provider]: value }
        }));
    };

    const updateDefaultModel = (provider: string, value: string) => {
        setSettings(prev => ({
            ...prev,
            providerDefaultModels: { ...(prev.providerDefaultModels || {}), [provider]: value }
        }));
    };

    const updateWorkflowDefault = (
        workflow: 'generator' | 'converter',
        mode: EngineMode,
        step: keyof DeepModeDefaults | null,
        field: keyof StepModelConfig,
        value: any
    ) => {
        setSettings(prev => {
            const current = prev.workflowDefaults || DEFAULT_WORKFLOW_DEFAULTS;
            if (mode === EngineMode.Regular) {
                return {
                    ...prev,
                    workflowDefaults: {
                        ...current,
                        [workflow]: {
                            ...current[workflow],
                            regular: { ...current[workflow].regular, [field]: value }
                        }
                    }
                };
            } else if (step) {
                return {
                    ...prev,
                    workflowDefaults: {
                        ...current,
                        [workflow]: {
                            ...current[workflow],
                            deep: {
                                ...current[workflow].deep,
                                [step]: { ...current[workflow].deep[step], [field]: value }
                            }
                        }
                    }
                };
            }
            return prev;
        });
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return {
        settings,
        setSettings,
        showKeys,
        saved,
        setSaved,
        isFullscreen,
        setIsFullscreen,
        confirmClear,
        setConfirmClear,
        activeTab,
        setActiveTab,
        apiSubTab,
        setApiSubTab,
        expandedSections,
        setExpandedSections,
        availablePromptSets,
        setAvailablePromptSets,
        promptMetadata,
        setPromptMetadata,
        toggleShowKey,
        updateSetting,
        updateProviderKey,
        updateDefaultModel,
        updateWorkflowDefault,
        toggleSection,
        handleSave,
        handleClearAll,
        loadSettings
    };
}
