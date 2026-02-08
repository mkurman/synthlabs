/**
 * SessionLayoutExample.tsx
 *
 * Reference implementation showing how to integrate all session management components.
 * This demonstrates the complete three-column layout with session management hooks.
 *
 * To integrate into App.tsx:
 * 1. Import this component or copy the pattern
 * 2. Replace AppMainContent with this layout
 * 3. Pass your existing LogFeed/Analytics/Settings components as children
 */

import { ReactNode, useCallback, useState } from 'react';
import { AppView } from '../interfaces/enums';
import { Environment } from '../interfaces/enums';
import { MainViewMode } from '../interfaces/enums/MainViewMode';
import { SessionSort } from '../interfaces/enums/SessionSort';
import { ControlAction } from '../interfaces/enums/ControlAction';
import { SessionStatus } from '../interfaces/enums/SessionStatus';

// Layout components
import SessionSidebar from './layout/SessionSidebar';
import MainContent from './layout/MainContent';
import ControlPanel from './layout/ControlPanel';

// Session management hooks
import { useSessionManager } from '../hooks/useSessionManager';
import { useSessionAutoSave } from '../hooks/useSessionAutoSave';
import { useSessionLoader } from '../hooks/useSessionLoader';

interface SessionLayoutExampleProps {
    environment: Environment;
    children: ReactNode; // Your LogFeed or Analytics component
    settingsPanel?: ReactNode; // Your GenerationParamsInput or Verifier settings
}

export default function SessionLayoutExample({
    environment,
    children,
    settingsPanel
}: SessionLayoutExampleProps) {
    // View mode state
    const [currentMode, setCurrentMode] = useState<AppView>(AppView.Creator);
    const [viewMode, setViewMode] = useState<MainViewMode>(MainViewMode.Feed);

    // Generation state (pass from parent in real implementation)
    const [isGenerating, setIsGenerating] = useState(false);

    // Session management
    const sessionManager = useSessionManager({
        environment,
        onSessionChange: (session) => {
            console.log('Session changed:', session);
            // In real App.tsx, update your app state here
            // For example: setSessionUid(session?.id || '')
        }
    });

    // Lazy loading for session items
    const sessionLoader = useSessionLoader<any>({
        sessionId: sessionManager.currentSession?.id || null,
        pageSize: 50,
        prefetchPageCount: 2,
        enabled: !!sessionManager.currentSession
    });

    // Auto-save current session
    useSessionAutoSave({
        session: sessionManager.currentSession,
        enabled: true,
        debounceMs: 2000,
        onSave: (session) => {
            console.log('Session auto-saved:', session.name);
        },
        onError: (error) => {
            console.error('Auto-save failed:', error);
        }
    });

    /**
     * Handle new session creation
     */
    const handleNewSession = useCallback(async (mode: AppView) => {
        try {
            // Create session with AI naming
            // In real implementation, pass your model config from settings
            const newSession = await sessionManager.createSession(
                mode,
                undefined, // dataset (optional)
                undefined  // modelConfig for AI naming (optional)
            );

            console.log('Created new session:', newSession);

            // Switch to the new session's mode
            setCurrentMode(mode);
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    }, [sessionManager]);

    /**
     * Handle session selection
     */
    const handleSessionSelect = useCallback((sessionId: string) => {
        sessionManager.selectSession(sessionId);
    }, [sessionManager]);

    /**
     * Handle session rename
     */
    const handleSessionRename = useCallback((sessionId: string, newName: string) => {
        sessionManager.renameSession(sessionId, newName);
    }, [sessionManager]);

    /**
     * Handle sort change
     */
    const handleSortChange = useCallback((sort: SessionSort) => {
        sessionManager.setSortBy(sort);
    }, [sessionManager]);

    /**
     * Handle control actions
     */
    const handleControlAction = useCallback(async (action: ControlAction) => {
        if (!sessionManager.currentSession) return;

        const sessionId = sessionManager.currentSession.id;

        switch (action) {
            case ControlAction.Start:
                console.log('Starting generation...');
                setIsGenerating(true);
                await sessionManager.updateSessionStatus(sessionId, SessionStatus.Active);
                // In real App.tsx: call your startGeneration() function
                break;

            case ControlAction.Pause:
                console.log('Pausing generation...');
                setIsGenerating(false);
                await sessionManager.updateSessionStatus(sessionId, SessionStatus.Paused);
                // In real App.tsx: call your pauseGeneration() function
                break;

            case ControlAction.Resume:
                console.log('Resuming generation...');
                setIsGenerating(true);
                await sessionManager.updateSessionStatus(sessionId, SessionStatus.Active);
                // In real App.tsx: call your resumeGeneration() function
                break;

            case ControlAction.Stop:
                console.log('Stopping generation...');
                setIsGenerating(false);
                await sessionManager.updateSessionStatus(sessionId, SessionStatus.Completed);
                // In real App.tsx: call your stopGeneration() function
                break;

            case ControlAction.Clear:
                console.log('Clearing session items...');
                // In real App.tsx: clear your logs and reset session item count
                await sessionManager.updateSessionItemCount(sessionId, 0);
                await sessionLoader.reload();
                break;
        }
    }, [sessionManager, sessionLoader]);

    /**
     * Handle mode change
     */
    const handleModeChange = useCallback((mode: AppView) => {
        setCurrentMode(mode);
        // In real App.tsx: update your appView state
    }, []);

    /**
     * Handle view mode change
     */
    const handleViewModeChange = useCallback((mode: MainViewMode) => {
        setViewMode(mode);
        // In real App.tsx: update your viewMode state to switch between Feed/Analytics
    }, []);

    return (
        <div className="flex h-screen bg-slate-950">
            {/* Left Sidebar - Sessions */}
            <SessionSidebar
                sessions={sessionManager.sessions}
                currentSessionId={sessionManager.currentSession?.id || null}
                currentMode={currentMode}
                onSessionSelect={handleSessionSelect}
                onNewSession={handleNewSession}
                onModeChange={handleModeChange}
                onRename={handleSessionRename}
                sortBy={sessionManager.sortBy}
                onSortChange={handleSortChange}
            />

            {/* Main Content - Feed/Analytics */}
            <MainContent
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                mobileControls={
                    // On mobile/tablet, show controls at top
                    <ControlPanel
                        currentSession={sessionManager.currentSession}
                        isGenerating={isGenerating}
                        onAction={handleControlAction}
                    >
                        {settingsPanel}
                    </ControlPanel>
                }
            >
                {children}
            </MainContent>

            {/* Right Sidebar - Controls (desktop only, via Tailwind responsive classes) */}
            <div className="hidden xl:block">
                <ControlPanel
                    currentSession={sessionManager.currentSession}
                    isGenerating={isGenerating}
                    onAction={handleControlAction}
                >
                    {settingsPanel}
                </ControlPanel>
            </div>
        </div>
    );
}
