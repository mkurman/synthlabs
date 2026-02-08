import { createPortal } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import { ExternalProvider, ProviderType, VerifierItem } from '../../../types';
import ChatPanel from '../../ChatPanel';
import { ToolExecutor } from '../../../services/toolService';

interface VerifierAssistantPortalProps {
    isOpen: boolean;
    data: VerifierItem[];
    setData: Dispatch<SetStateAction<VerifierItem[]>>;
    modelConfig: {
        provider: ProviderType;
        externalProvider: ExternalProvider;
        externalModel: string;
        apiKey: string;
        externalApiKey: string;
    };
    toolExecutor?: ToolExecutor;
}

export default function VerifierAssistantPortal({
    isOpen,
    data,
    setData,
    modelConfig,
    toolExecutor
}: VerifierAssistantPortalProps) {
    const mountNode = typeof document !== 'undefined' ? document.getElementById('verifier-assistant') : null;
    if (!isOpen || !mountNode) {
        return null;
    }

    return createPortal(
        <div className="h-full">
            <ChatPanel data={data} setData={setData} modelConfig={modelConfig} toolExecutor={toolExecutor} />
        </div>,
        mountNode
    );
}
