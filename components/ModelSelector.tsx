import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, RefreshCw, Search, Edit2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { ModelListProvider, ProviderModel } from '../types';
import { getModels, requiresApiKeyForModels, getDefaultModels } from '../services/modelService';

interface ModelSelectorProps {
    provider: ModelListProvider;
    value: string;
    onChange: (model: string) => void;
    apiKey?: string;
    customBaseUrl?: string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

export default function ModelSelector({
    provider,
    value,
    onChange,
    apiKey = '',
    customBaseUrl,
    disabled = false,
    placeholder = 'Select or enter model',
    className = ''
}: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [isManualMode, setIsManualMode] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [models, setModels] = useState<ProviderModel[]>([]);
    const [fromCache, setFromCache] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const loadDebounceRef = useRef<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Check if this provider needs an API key
    const needsApiKey = requiresApiKeyForModels(provider);

    // Filter models by search term
    const filteredModels = models.filter(model =>
        model.id.toLowerCase().includes(search.toLowerCase()) ||
        (model.name && model.name.toLowerCase().includes(search.toLowerCase()))
    );

    // Load models when dropdown opens or provider changes
    const loadModels = useCallback(async (forceRefresh = false) => {
        setIsLoading(true);
        setError(null);

        try {
            // Always try to fetch - service handles missing API key gracefully
            const result = await getModels(provider, apiKey || '', forceRefresh, customBaseUrl);
            setModels(result.models);
            setFromCache(result.fromCache);
            if (result.error) {
                setError(result.error);
            }
            // If we got models but no API key was provided, note it
            if (result.models.length > 0 && needsApiKey && !apiKey) {
                setError('Using default models (no API key configured)');
            }
        } catch (err) {
            // On error, try to show default models
            const defaultModels = getDefaultModels(provider);
            if (defaultModels.length > 0) {
                setModels(defaultModels);
                setFromCache(false);
                setError('Using default models (fetch failed)');
            } else {
                setError(err instanceof Error ? err.message : 'Failed to load models');
                setModels([]);
            }
        } finally {
            setIsLoading(false);
        }
    }, [provider, apiKey, customBaseUrl, needsApiKey]);

    // Load models only when dropdown is open (debounced to avoid spamming providers)
    useEffect(() => {
        if (!isOpen) return;

        if (loadDebounceRef.current) {
            window.clearTimeout(loadDebounceRef.current);
        }
        loadDebounceRef.current = window.setTimeout(() => {
            loadModels();
        }, 500);

        return () => {
            if (loadDebounceRef.current) {
                window.clearTimeout(loadDebounceRef.current);
            }
        };
    }, [isOpen, provider, apiKey, customBaseUrl, loadModels]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch('');
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredModels.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredModels.length) {
                    selectModel(filteredModels[highlightedIndex].id);
                } else if (search) {
                    selectModel(search);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSearch('');
                setHighlightedIndex(-1);
                break;
        }
    };

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-model-item]');
            items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex]);

    const selectModel = (modelId: string) => {
        onChange(modelId);
        setIsOpen(false);
        setSearch('');
        setHighlightedIndex(-1);
    };

    const handleRefresh = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await loadModels(true);
    };

    const toggleManualMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsManualMode(!isManualMode);
        if (!isManualMode) {
            setIsOpen(false);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    // Manual input mode
    if (isManualMode) {
        return (
            <div className={`relative ${isOpen ? 'z-[9999]' : 'z-10'} ${className}`} ref={dropdownRef}>
                <div className="flex gap-1">
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="flex-1 bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 outline-none disabled:opacity-50"
                    />
                    <button
                        onClick={toggleManualMode}
                        className="px-2 py-1.5 bg-slate-900/60 border border-slate-700/70 rounded text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors"
                        title="Switch to dropdown mode"
                    >
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    // Dropdown mode
    return (
        <div className={`relative ${isOpen ? 'z-[9999]' : 'z-10'} ${className}`} ref={dropdownRef}>
            {/* Dropdown trigger */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className="w-full flex items-center justify-between bg-slate-950 border border-slate-700/70 rounded px-2 py-1.5 text-xs text-slate-100 hover:border-sky-500/50 focus:border-sky-500 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <span className={!value ? 'text-slate-400' : 'font-mono truncate'}>
                    {value || placeholder}
                </span>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {isLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                    {error && !isLoading && (
                        <span title={error}>
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                        </span>
                    )}
                    {fromCache && !isLoading && !error && (
                        <span className="text-[8px] text-slate-500" title="From cache">cached</span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-slate-950/70 border border-slate-700/70 rounded-lg shadow-2xl max-h-72 overflow-hidden flex flex-col">
                    {/* Search and actions bar */}
                    <div className="px-2 py-1.5 border-b border-slate-800/70 bg-slate-950/70 flex items-center gap-1.5">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search models..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full pl-6 pr-2 py-1 text-[10px] bg-slate-950 border border-slate-700/70 rounded focus:border-sky-500/50 focus:outline-none text-slate-100 placeholder-slate-500"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={isLoading}
                            className="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Refresh models"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={toggleManualMode}
                            className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                            title="Enter model manually"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Status bar */}
                    {error && (
                        <div className={`px-3 py-1.5 border-b text-[10px] flex items-center gap-1.5 ${error.startsWith('Using default')
                                ? 'bg-slate-500/10 border-slate-500/20 text-slate-300'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{error}</span>
                        </div>
                    )}

                    {/* Model list */}
                    <div className="overflow-y-auto flex-1" ref={listRef}>
                        {isLoading && models.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading models...
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-400 text-center">
                                {models.length === 0 ? (
                                    <div className="space-y-2">
                                        <p>No models available</p>
                                        <button
                                            onClick={toggleManualMode}
                                            className="text-sky-400 hover:text-sky-300"
                                        >
                                            Enter model ID manually
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <p>No matches for "{search}"</p>
                                        <button
                                            onClick={() => selectModel(search)}
                                            className="text-sky-400 hover:text-sky-300"
                                        >
                                            Use "{search}" anyway
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            filteredModels.map((model, index) => {
                                const isSelected = value === model.id;
                                const isHighlighted = index === highlightedIndex;
                                return (
                                    <button
                                        key={model.id}
                                        data-model-item
                                        onClick={() => selectModel(model.id)}
                                        className={`w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors ${isHighlighted ? 'bg-slate-900/60' : 'hover:bg-slate-900/60'
                                            } ${isSelected ? 'text-white' : 'text-slate-300'}`}
                                    >
                                        <div className={`w-3.5 h-3.5 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected
                                                ? 'bg-sky-500 border-sky-500'
                                                : 'border-slate-600'
                                            }`}>
                                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-[11px] truncate">
                                                {model.id}
                                            </div>
                                            {(model.name && model.name !== model.id) && (
                                                <div className="text-[9px] text-slate-400 truncate">
                                                    {model.name}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {model.context_length && (
                                                    <span className="text-[8px] text-slate-500">
                                                        {(model.context_length / 1000).toFixed(0)}K ctx
                                                    </span>
                                                )}
                                                {model.owned_by && (
                                                    <span className="text-[8px] text-slate-500">
                                                        {model.owned_by}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer with count */}
                    {models.length > 0 && (
                        <div className="px-3 py-1 border-t border-slate-800/70 bg-slate-950/70 text-[9px] text-slate-500 flex items-center justify-between">
                            <span>
                                {filteredModels.length === models.length
                                    ? `${models.length} models`
                                    : `${filteredModels.length} of ${models.length}`}
                            </span>
                            {fromCache && (
                                <span className="text-slate-700">cached</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
