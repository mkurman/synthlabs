import React, { useState, useRef, useCallback, useEffect } from 'react';

interface SplitPaneProps {
    left: React.ReactNode;
    right: React.ReactNode;
    defaultSplit?: number; // Percentage (0-100)
    minLeft?: number; // Minimum left pane percentage
    minRight?: number; // Minimum right pane percentage
    className?: string;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
    left,
    right,
    defaultSplit = 40,
    minLeft = 25,
    minRight = 30,
    className = ''
}) => {
    const [split, setSplit] = useState(defaultSplit);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback(() => {
        setIsDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        
        // Constrain to min values
        const newSplit = Math.max(minLeft, Math.min(100 - minRight, percentage));
        setSplit(newSplit);
    }, [isDragging, minLeft, minRight]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div 
            ref={containerRef}
            className={`flex w-full h-full overflow-hidden ${className}`}
        >
            {/* Left Pane */}
            <div 
                className="flex flex-col overflow-hidden"
                style={{ width: `${split}%`, minWidth: `${minLeft}%` }}
            >
                {left}
            </div>

            {/* Resizer */}
            <div
                className={`w-1 flex-shrink-0 bg-slate-800 hover:bg-sky-500/50 transition-colors cursor-col-resize relative group ${
                    isDragging ? 'bg-sky-500' : ''
                }`}
                onMouseDown={handleMouseDown}
            >
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full transition-colors ${
                    isDragging ? 'bg-sky-400' : 'bg-slate-600 group-hover:bg-sky-400'
                }`} />
            </div>

            {/* Right Pane */}
            <div 
                className="flex flex-col overflow-hidden"
                style={{ width: `${100 - split}%`, minWidth: `${minRight}%` }}
            >
                {right}
            </div>
        </div>
    );
};

export default SplitPane;
