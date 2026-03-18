import { useCallback, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import ChatPanel from './ChatPanel';
import type { VerifierItem, ProviderType, ExternalProvider } from '../types';

interface AssistantDrawerProps {
    isOpen: boolean;
    onToggle: () => void;
    onAgentBusyChange?: (busy: boolean) => void;
    modelConfig: {
        provider: ProviderType;
        externalProvider: ExternalProvider;
        externalModel: string;
        apiKey: string;
        externalApiKey: string;
    };
}

const EMPTY_DATA: VerifierItem[] = [];

/**
 * Global AI assistant panel.
 * Sits in the flex layout as a right-side sibling of LayoutContainer,
 * pushing content left when open (no overlay / no blur).
 *
 * ChatPanel is mounted on first open and stays alive permanently so
 * streaming connections and chat state survive drawer close / view changes.
 */
export default function AssistantDrawer({ isOpen, onToggle, onAgentBusyChange, modelConfig }: AssistantDrawerProps) {
    const [data, setData] = useState<VerifierItem[]>(EMPTY_DATA);
    const handleSetData = useCallback((d: VerifierItem[]) => setData(d), []);

    // Mount ChatPanel on first open, then keep it alive forever
    const hasBeenOpened = useRef(false);
    if (isOpen) hasBeenOpened.current = true;

    return (
        <>
            {/* Floating toggle — visible when drawer is closed */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed bottom-6 right-6 z-50 p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
                    title="Open AI assistant"
                >
                    <Bot className="w-5 h-5" />
                </button>
            )}

            {/* Panel — part of flex layout, pushes content */}
            <aside
                className={`
                    flex-shrink-0 border-l border-slate-800/70 bg-slate-950/80
                    flex flex-col transition-all duration-300 ease-in-out overflow-hidden
                    ${isOpen ? 'w-[420px]' : 'w-0 border-l-0'}
                `}
            >
                <div className="w-[420px] h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/70 flex-shrink-0">
                        <div className="flex items-center gap-2 text-slate-200">
                            <Bot className="w-4 h-4 text-sky-400" />
                            <span className="text-xs font-semibold">AI Assistant</span>
                        </div>
                        <button
                            onClick={onToggle}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
                            title="Close assistant"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* ChatPanel stays mounted once first opened — never unmounts */}
                    <div className="flex-1 min-h-0">
                        {hasBeenOpened.current && (
                            <ChatPanel
                                data={data}
                                setData={handleSetData}
                                modelConfig={modelConfig}
                                onStreamingChange={onAgentBusyChange}
                            />
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
