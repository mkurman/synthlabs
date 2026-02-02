import React, { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';

interface ThinkSection {
    type: 'text' | 'think';
    content: string;
}

function parseContentWithThinkTags(content: string): ThinkSection[] {
    const sections: ThinkSection[] = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        // Add text before the think tag
        if (match.index > lastIndex) {
            const textBefore = content.slice(lastIndex, match.index);
            if (textBefore.trim()) {
                sections.push({ type: 'text', content: textBefore });
            }
        }

        // Add the think content
        sections.push({ type: 'think', content: match[1] });
        lastIndex = regex.lastIndex;
    }

    // Add remaining text after last think tag
    if (lastIndex < content.length) {
        const textAfter = content.slice(lastIndex);
        if (textAfter.trim()) {
            sections.push({ type: 'text', content: textAfter });
        }
    }

    // If no think tags found, return the whole content as text
    if (sections.length === 0 && content.trim()) {
        sections.push({ type: 'text', content });
    }

    return sections;
}

interface CollapsibleThinkSectionProps {
    content: string;
    index: number;
}

function CollapsibleThinkSection({ content, index }: CollapsibleThinkSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="my-1">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-400 px-2 py-1 rounded transition-colors"
            >
                <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                <Brain className="w-3 h-3" />
                <span className="font-medium">Thoughts</span>
            </button>
            {isExpanded && (
                <div className="mt-1 ml-4 pl-2 border-l-2 border-purple-500/30 text-[10px] text-slate-400 whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-200">
                    {content.trim()}
                </div>
            )}
        </div>
    );
}

interface CollapsibleThinkContentProps {
    content: string;
    className?: string;
}

export default function CollapsibleThinkContent({ content, className = '' }: CollapsibleThinkContentProps) {
    const sections = parseContentWithThinkTags(content);

    return (
        <div className={className}>
            {sections.map((section, idx) => (
                section.type === 'think' ? (
                    <CollapsibleThinkSection key={idx} content={section.content} index={idx} />
                ) : (
                    <span key={idx} className="whitespace-pre-wrap">{section.content}</span>
                )
            ))}
        </div>
    );
}
