import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Cloud, Trash2, Save, Eye, EyeOff, AlertTriangle, Check, Database, Cpu, ExternalLink, FileText } from 'lucide-react';
import { SettingsService, AppSettings, AVAILABLE_PROVIDERS } from '../services/settingsService';
import { PromptService } from '../services/promptService';
import { PROVIDER_URLS } from '../constants';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsChanged?: () => void;
}

// Provider display names and descriptions
const PROVIDER_INFO: Record<string, { name: string; description: string }> = {
    'gemini': { name: 'Google Gemini', description: 'Primary provider (env: VITE_GEMINI_API_KEY)' },
    'openai': { name: 'OpenAI', description: 'GPT-4, GPT-3.5, etc.' },
    'anthropic': { name: 'Anthropic', description: 'Claude models' },
    'openrouter': { name: 'OpenRouter', description: 'Multi-model router' },
    'together': { name: 'Together AI', description: 'Open-source models' },
    'groq': { name: 'Groq', description: 'Ultra-fast inference' },
    'cerebras': { name: 'Cerebras', description: 'High-performance AI' },
    'featherless': { name: 'Featherless', description: 'Serverless inference' },
    'qwen': { name: 'Qwen', description: 'Alibaba Qwen models' },
    'qwen-deepinfra': { name: 'Qwen (DeepInfra)', description: 'Qwen via DeepInfra' },
    'kimi': { name: 'Kimi (Moonshot)', description: 'Moonshot AI' },
    'z.ai': { name: 'Z.AI', description: 'Z.AI platform' },
    'ollama': { name: 'Ollama', description: 'Local models (no key needed)' },
    'chutes': { name: 'Chutes', description: 'Chutes LLM API' },
    'huggingface': { name: 'HuggingFace Inference', description: 'HF Inference API' },
    'other': { name: 'Custom Endpoint', description: 'Your own OpenAI-compatible API' },
};

export default function SettingsPanel({ isOpen, onClose, onSettingsChanged }: SettingsPanelProps) {
    const [settings, setSettings] = useState<AppSettings>({ providerKeys: {} });
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [saved, setSaved] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [activeTab, setActiveTab] = useState<'providers' | 'huggingface' | 'firebase' | 'storage' | 'prompts'>('providers');
    const [availablePromptSets, setAvailablePromptSets] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSettings(SettingsService.getSettings());
            setSaved(false);
            setConfirmClear(false);
            setAvailablePromptSets(PromptService.getAvailableSets());
        }
    }, [isOpen]);

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
        // Small delay to ensure clearAllData completes before reload
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

    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Split providers into primary (Gemini) and external
    const externalProviders = AVAILABLE_PROVIDERS.filter(p => p !== 'other');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-400" />
                        Settings
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800">
                    {[
                        { id: 'providers', label: 'API Keys', icon: Key },
                        { id: 'prompts', label: 'Prompts', icon: FileText },
                        { id: 'huggingface', label: 'HuggingFace', icon: Cloud },
                        { id: 'firebase', label: 'Firebase', icon: Database },
                        { id: 'storage', label: 'Storage', icon: Cpu },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                            className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === tab.id
                                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50'
                                : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'providers' && (
                        <div className="space-y-6">
                            {/* Gemini - Primary Provider */}
                            <div className="bg-indigo-950/30 rounded-lg p-4 border border-indigo-500/30">
                                <h3 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-2">
                                    <Key className="w-4 h-4" />
                                    Primary Provider: Gemini
                                </h3>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase">
                                        Gemini API Key
                                        {import.meta.env.VITE_GEMINI_API_KEY && !settings.geminiApiKey && (
                                            <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                        )}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showKeys['gemini'] ? 'text' : 'password'}
                                            value={settings.geminiApiKey || ''}
                                            onChange={(e) => updateSetting('geminiApiKey', e.target.value)}
                                            placeholder={import.meta.env.VITE_GEMINI_API_KEY ? '●●●●●●●● (env configured)' : 'AIza...'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none pr-10"
                                        />
                                        <button
                                            onClick={() => toggleShowKey('gemini')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                        >
                                            {showKeys['gemini'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* External Providers */}
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                                    <Key className="w-4 h-4 text-amber-400" />
                                    External Providers
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Keys override environment variables. Leave empty to use .env values.
                                </p>

                                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                    {externalProviders.map(provider => {
                                        const info = PROVIDER_INFO[provider] || { name: provider, description: '' };
                                        const baseUrl = PROVIDER_URLS[provider] || '';
                                        // Check if env var exists for this provider
                                        const envVarMap: Record<string, string | undefined> = {
                                            'openai': import.meta.env.VITE_OPENAI_API_KEY,
                                            'anthropic': import.meta.env.VITE_ANTHROPIC_API_KEY,
                                            'openrouter': import.meta.env.VITE_OPENROUTER_API_KEY,
                                            'together': import.meta.env.VITE_TOGETHER_API_KEY,
                                            'groq': import.meta.env.VITE_GROQ_API_KEY,
                                            'cerebras': import.meta.env.VITE_CEREBRAS_API_KEY,
                                            'featherless': import.meta.env.VITE_FEATHERLESS_API_KEY,
                                            // Both 'qwen' and 'qwen-deepinfra' intentionally share the same API key
                                            'qwen': import.meta.env.VITE_QWEN_API_KEY,
                                            'qwen-deepinfra': import.meta.env.VITE_QWEN_API_KEY,
                                            'kimi': import.meta.env.VITE_KIMI_API_KEY,
                                            'z.ai': import.meta.env.VITE_ZAI_API_KEY,
                                            'chutes': import.meta.env.VITE_CHUTES_API_KEY,
                                            'huggingface': import.meta.env.VITE_HF_TOKEN,
                                        };
                                        const hasEnvVar = envVarMap[provider] && !settings.providerKeys[provider];

                                        return (
                                            <div key={provider} className="bg-slate-900/50 rounded p-3 border border-slate-800">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div>
                                                        <span className="text-xs font-bold text-slate-200">{info.name}</span>
                                                        {hasEnvVar && (
                                                            <span className="text-emerald-400 text-[9px] ml-2 font-normal">(from .env)</span>
                                                        )}
                                                        {baseUrl && (
                                                            <span className="text-[9px] text-slate-600 ml-2 font-mono">{baseUrl}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type={showKeys[provider] ? 'text' : 'password'}
                                                        value={settings.providerKeys[provider] || ''}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateProviderKey(provider, e.target.value)}
                                                        placeholder={provider === 'ollama' ? 'No key needed for local' : hasEnvVar ? '●●●●●●●● (env configured)' : 'Enter API key...'}
                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 outline-none pr-10"
                                                    />
                                                    <button
                                                        onClick={() => toggleShowKey(provider)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                                    >
                                                        {showKeys[provider] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Custom Endpoint */}
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4 text-cyan-400" />
                                    Custom Endpoint (other)
                                </h3>
                                <p className="text-xs text-slate-500 mb-3">
                                    For OpenAI-compatible APIs. <code className="text-amber-400">/chat/completions</code> is appended automatically.
                                </p>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">Base URL</label>
                                        <input
                                            type="text"
                                            value={settings.customEndpointUrl || ''}
                                            onChange={(e) => updateSetting('customEndpointUrl', e.target.value)}
                                            placeholder="https://your-api.com/v1"
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">API Key</label>
                                        <div className="relative">
                                            <input
                                                type={showKeys['other'] ? 'text' : 'password'}
                                                value={settings.providerKeys['other'] || ''}
                                                onChange={(e) => updateProviderKey('other', e.target.value)}
                                                placeholder="Your custom API key"
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none pr-10"
                                            />
                                            <button
                                                onClick={() => toggleShowKey('other')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showKeys['other'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'huggingface' && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Cloud className="w-4 h-4 text-amber-400" />
                                    HuggingFace Settings
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Configure your HuggingFace token for uploading datasets to the Hub.
                                </p>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            HuggingFace Token
                                            {import.meta.env.VITE_HF_TOKEN && !settings.huggingFaceToken && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys['hf'] ? 'text' : 'password'}
                                                value={settings.huggingFaceToken || ''}
                                                onChange={(e) => updateSetting('huggingFaceToken', e.target.value)}
                                                placeholder={import.meta.env.VITE_HF_TOKEN ? '●●●●●●●● (env configured)' : 'hf_...'}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none pr-10"
                                            />
                                            <button
                                                onClick={() => toggleShowKey('hf')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showKeys['hf'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">Default Repository</label>
                                        <input
                                            type="text"
                                            value={settings.huggingFaceDefaultRepo || ''}
                                            onChange={(e) => updateSetting('huggingFaceDefaultRepo', e.target.value)}
                                            placeholder="username/dataset-name"
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                                <p className="text-xs text-amber-200">
                                    <strong>Get a token:</strong> Visit{' '}
                                    <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-100">
                                        huggingface.co/settings/tokens
                                    </a>
                                    {' '}and create a token with "write" access.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'firebase' && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Database className="w-4 h-4 text-orange-400" />
                                    Firebase Configuration
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Configure Firebase for cloud storage of sessions and logs. All fields are required to connect.
                                </p>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            API Key
                                            {import.meta.env.VITE_FIREBASE_API_KEY && !settings.firebaseApiKey && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys['firebase'] ? 'text' : 'password'}
                                                value={settings.firebaseApiKey || ''}
                                                onChange={(e) => updateSetting('firebaseApiKey', e.target.value)}
                                                placeholder={import.meta.env.VITE_FIREBASE_API_KEY ? '●●●●●●●● (env configured)' : 'AIza...'}
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none pr-10"
                                            />
                                            <button
                                                onClick={() => toggleShowKey('firebase')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                            >
                                                {showKeys['firebase'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Auth Domain
                                            {import.meta.env.VITE_FIREBASE_AUTH_DOMAIN && !settings.firebaseAuthDomain && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseAuthDomain || ''}
                                            onChange={(e) => updateSetting('firebaseAuthDomain', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'your-app.firebaseapp.com'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Project ID
                                            {import.meta.env.VITE_FIREBASE_PROJECT_ID && !settings.firebaseProjectId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseProjectId || ''}
                                            onChange={(e) => updateSetting('firebaseProjectId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-project-id'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Storage Bucket
                                            {import.meta.env.VITE_FIREBASE_STORAGE_BUCKET && !settings.firebaseStorageBucket && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseStorageBucket || ''}
                                            onChange={(e) => updateSetting('firebaseStorageBucket', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'your-app.appspot.com'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            Messaging Sender ID
                                            {import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID && !settings.firebaseMessagingSenderId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseMessagingSenderId || ''}
                                            onChange={(e) => updateSetting('firebaseMessagingSenderId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase">
                                            App ID
                                            {import.meta.env.VITE_FIREBASE_APP_ID && !settings.firebaseAppId && (
                                                <span className="text-emerald-400 ml-2 normal-case font-normal">(from .env)</span>
                                            )}
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.firebaseAppId || ''}
                                            onChange={(e) => updateSetting('firebaseAppId', e.target.value)}
                                            placeholder={import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abc123'}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-pink-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-4">
                                <p className="text-xs text-pink-200">
                                    <strong>Note:</strong> Firebase configuration is saved when you click "Save Settings" and will be used to connect on next app load.
                                    If you have values in <code>.env</code>, those will be used as defaults.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'storage' && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-cyan-400" />
                                    Local Storage
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Manage locally stored data including sessions, logs, and settings.
                                </p>

                                <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <h4 className="text-sm font-bold text-red-400 mb-1">Clear All Data</h4>
                                            <p className="text-xs text-slate-400 mb-3">
                                                This will permanently delete all stored settings, API keys, session data, and logs from this browser. This action cannot be undone.
                                            </p>
                                            <button
                                                onClick={handleClearAll}
                                                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold transition-colors ${confirmClear
                                                    ? 'bg-red-600 hover:bg-red-500 text-white'
                                                    : 'bg-red-950 hover:bg-red-900 text-red-400 border border-red-500/30'
                                                    }`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                {confirmClear ? 'Click Again to Confirm' : 'Clear All Data'}
                                            </button>
                                            {confirmClear && (
                                                <button
                                                    onClick={() => setConfirmClear(false)}
                                                    className="ml-2 text-xs text-slate-500 hover:text-slate-300"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'prompts' && (
                        <div className="space-y-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-emerald-400" />
                                    Prompt Configuration
                                </h3>
                                <p className="text-xs text-slate-500 mb-4">
                                    Select the prompt set to use for generating reasoning traces and responses.
                                    Prompts are loaded from <code>/prompts/&lt;set_name&gt;/</code>.
                                </p>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-bold uppercase">Active Prompt Set</label>
                                    <select
                                        value={settings.promptSet || 'default'}
                                        onChange={(e) => updateSetting('promptSet', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none"
                                    >
                                        {availablePromptSets.map(set => (
                                            <option key={set} value={set}>{set}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-600 mt-2">
                                        Default set is usually correct irrespective of the model. Custom sets can be added by creating new folders in the <code>prompts</code> directory.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={`flex items-center gap-2 px-6 py-2 rounded text-sm font-bold transition-colors ${saved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                    >
                        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saved ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
