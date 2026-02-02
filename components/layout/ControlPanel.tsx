import { ReactNode } from 'react';
import SessionControls from './SessionControls';
import { SessionData } from '../../types';
import { ControlAction } from '../../interfaces/enums/ControlAction';

interface ControlPanelProps {
    currentSession: SessionData | null;
    isGenerating: boolean;
    onAction: (action: ControlAction) => void;
    children?: ReactNode; // Mode-specific controls (settings, params, etc.)
}

export default function ControlPanel({
    currentSession,
    isGenerating,
    onAction,
    children
}: ControlPanelProps) {
    return (
        <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
            {/* Session Controls */}
            <SessionControls
                currentSession={currentSession}
                isGenerating={isGenerating}
                onAction={onAction}
            />

            {/* Mode-Specific Controls (Settings, Parameters, etc.) */}
            <div className="flex-1 overflow-y-auto p-4">
                {children || (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-slate-500 text-sm">
                            <p>No session selected</p>
                            <p className="text-xs mt-1">Create a new session to get started</p>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
