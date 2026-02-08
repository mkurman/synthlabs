import React from 'react';

interface RightSidebarProps {
    children: React.ReactNode;
}

export default function RightSidebar({ children }: RightSidebarProps) {
    return (
        <div className="h-full flex flex-col bg-slate-950/70">
            {children}
        </div>
    );
}
