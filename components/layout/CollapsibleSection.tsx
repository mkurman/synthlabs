import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    icon?: ReactNode;
    summary?: string;
    defaultExpanded?: boolean;
    children: ReactNode;
}

export default function CollapsibleSection({
    title,
    icon,
    summary,
    defaultExpanded = false,
    children
}: CollapsibleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="bg-slate-950/70 rounded-lg border border-slate-800/70 overflow-visible relative">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-slate-900/60 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-xs font-bold text-slate-200">{title}</span>
                    {!isExpanded && summary && (
                        <span className="text-[10px] text-slate-400 ml-2">{summary}</span>
                    )}
                </div>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-300" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
            </button>

            {isExpanded && (
                <div className="p-3 pt-0 border-t border-slate-800/70 mt-1">
                    {children}
                </div>
            )}
        </div>
    );
}
