import { ReactNode } from 'react';
import { MainViewMode } from '../../interfaces/enums/MainViewMode';
import ModeNavbar from './ModeNavbar';

interface MainContentProps {
    viewMode: MainViewMode;
    onViewModeChange: (mode: MainViewMode) => void;
    children: ReactNode;
    mobileControls?: ReactNode; // Controls shown on mobile/tablet at top
}

export default function MainContent({
    viewMode,
    onViewModeChange,
    children,
    mobileControls
}: MainContentProps) {
    return (
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            {/* View Mode Navigation Bar */}
            <ModeNavbar
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
            />

            {/* Mobile/Tablet Controls (shown below navbar on smaller screens) */}
            {mobileControls && (
                <div className="xl:hidden border-b border-slate-800 bg-slate-900">
                    {mobileControls}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden">
                {children}
            </div>
        </main>
    );
}
