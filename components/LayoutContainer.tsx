import { ReactNode, useState, useEffect } from 'react';
import { PanelRightOpen, PanelLeftOpen, X, Cpu } from 'lucide-react';

interface LayoutContainerProps {
    leftSidebar: ReactNode;
    mainContent: ReactNode;
    rightSidebar: ReactNode;
    // Responsive props
    isLeftSidebarOpen?: boolean;
    onLeftSidebarToggle?: (isOpen: boolean) => void;
    isRightSidebarOpen?: boolean;
    onRightSidebarToggle?: (isOpen: boolean) => void;
}

export default function LayoutContainer({
    leftSidebar,
    mainContent,
    rightSidebar,
    isLeftSidebarOpen = true,
    onLeftSidebarToggle,
    isRightSidebarOpen = true,
    onRightSidebarToggle
}: LayoutContainerProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width < 1280);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Desktop Layout
    if (!isMobile && !isTablet) {
        return (
            <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
                {/* Left Sidebar - Collapsible */}
                <aside
                    className={`
                        flex-shrink-0 border-r border-slate-800/70 bg-slate-950/80 flex flex-col transition-all duration-300 ease-in-out relative backdrop-blur-xl
                        ${isLeftSidebarOpen ? 'w-[280px]' : 'w-0 overflow-hidden border-r-0'}
                    `}
                >
                    <div className="w-[280px] h-full flex flex-col">
                        {leftSidebar}
                    </div>
                    {/* Close button inside sidebar */}
                    {isLeftSidebarOpen && onLeftSidebarToggle && (
                        <button
                            onClick={() => onLeftSidebarToggle(false)}
                            className="absolute top-4 right-2 p-1.5 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors z-10"
                            title="Collapse sidebar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </aside>

                {/* Floating button to open left sidebar when collapsed */}
                {!isLeftSidebarOpen && onLeftSidebarToggle && (
                    <button
                        onClick={() => onLeftSidebarToggle(true)}
                        className="fixed top-4 left-4 z-30 p-2 bg-slate-950/70 hover:bg-slate-900/60 text-slate-100 hover:text-white rounded-lg shadow-lg transition-all border border-slate-700/70 backdrop-blur"
                        title="Open sessions panel"
                    >
                        <PanelLeftOpen className="w-5 h-5" />
                    </button>
                )}

                {/* Main Content - Flex Grow */}
                <main className="flex-grow flex flex-col min-w-0 bg-slate-950/60 relative">
                    {mainContent}
                </main>

                {/* Right Sidebar - Collapsible */}
                {rightSidebar && (
                    <aside
                        className={`flex-shrink-0 border-l border-slate-800/70 bg-slate-950/80 flex flex-col backdrop-blur-xl transition-all duration-300 ease-in-out ${isRightSidebarOpen ? 'w-[420px]' : 'w-14'
                            }`}
                    >
                        <div className="h-full w-full">
                            {rightSidebar}
                        </div>
                    </aside>
                )}
            </div>
        );
    }

    // Tablet Layout (Right sidebar collapsed/hidden or moved)
    if (isTablet) {
        return (
            <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
                {/* Left Sidebar slide-over panel */}
                <aside
                    className={`
                        fixed inset-y-0 left-0 z-40 w-[280px] bg-slate-950/90 border-r border-slate-800/70 transition-transform duration-300 ease-in-out shadow-2xl backdrop-blur-xl
                        ${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    `}
                >
                    {leftSidebar}
                    {onLeftSidebarToggle && (
                        <button
                            onClick={() => onLeftSidebarToggle(false)}
                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors"
                            title="Close panel"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </aside>

                {/* Main Content */}
                <main className="flex-grow flex flex-col min-w-0 bg-slate-950/60 relative w-full">
                    {mainContent}

                    {/* Floating button to open left sidebar when closed */}
                    {!isLeftSidebarOpen && onLeftSidebarToggle && (
                        <button
                            onClick={() => onLeftSidebarToggle(true)}
                            className="fixed bottom-4 left-4 z-30 p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-lg transition-all hover:scale-105"
                            title="Open sessions panel"
                        >
                            <PanelLeftOpen className="w-5 h-5" />
                        </button>
                    )}

                    {/* Right Sidebar slide-over panel */}
                    <div
                        className={`
                            fixed inset-y-0 right-0 z-40 w-[320px] bg-slate-950/90 border-l border-slate-800/70 transition-transform duration-300 ease-in-out shadow-2xl backdrop-blur-xl
                            ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
                        `}
                    >
                        {rightSidebar}
                        {onRightSidebarToggle && (
                            <button
                                onClick={() => onRightSidebarToggle(false)}
                                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors"
                                title="Close panel"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Floating button to open right sidebar when closed */}
                    {!isRightSidebarOpen && onRightSidebarToggle && (
                        <button
                            onClick={() => onRightSidebarToggle(true)}
                            className="fixed bottom-4 right-4 z-30 p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-lg transition-all hover:scale-105"
                            title="Open controls panel"
                        >
                            <PanelRightOpen className="w-5 h-5" />
                        </button>
                    )}
                </main>
            </div>
        );
    }

    // Mobile Layout
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 relative">
            {/* Left Sidebar Drawer Overlay */}
            <div
                className={`
                    fixed inset-0 z-50 bg-black/50 transition-opacity duration-300
                    ${isLeftSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                `}
                onClick={() => onLeftSidebarToggle?.(false)}
            />
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] bg-slate-950/95 border-r border-slate-800/70 transition-transform duration-300 ease-in-out backdrop-blur-xl
                    ${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {leftSidebar}
                {onLeftSidebarToggle && (
                    <button
                        onClick={() => onLeftSidebarToggle(false)}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-white hover:bg-slate-900/60 rounded-lg transition-colors"
                        title="Close panel"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </aside>

            {/* Main Content with Stacked Right Sidebar */}
            <main className="flex-grow flex flex-col min-w-0 bg-slate-950/60 w-full relative">
                {/* Right Sidebar (Controls) - Stacked on top for mobile */}
                {rightSidebar && (
                    <div className="flex-shrink-0 border-b border-slate-800/70 bg-slate-950/70 max-h-[40vh] overflow-y-auto backdrop-blur-lg">
                        {rightSidebar}
                    </div>
                )}

                <div className="flex-1 overflow-hidden relative">
                    {mainContent}
                </div>

                {/* Floating button to open left sidebar when closed */}
                {!isLeftSidebarOpen && onLeftSidebarToggle && (
                    <button
                        onClick={() => onLeftSidebarToggle(true)}
                        className="fixed bottom-4 left-4 z-30 p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full shadow-lg transition-all hover:scale-105"
                        title="Open sessions panel"
                    >
                        <PanelLeftOpen className="w-5 h-5" />
                    </button>
                )}
            </main>
        </div>
    );
}
