import React from 'react';
import { MessageCircle, User, Bot, Brain } from 'lucide-react';

interface DetailSectionNavProps {
    activeSection: 'query' | 'reasoning' | 'answer' | 'conversation';
    onSectionChange: (section: 'query' | 'reasoning' | 'answer' | 'conversation') => void;
    isMultiTurn: boolean;
    messageCount?: number;
}

export const DetailSectionNav: React.FC<DetailSectionNavProps> = ({
    activeSection,
    onSectionChange,
    isMultiTurn,
    messageCount
}) => {
    if (isMultiTurn) {
        return (
            <div className="flex items-center gap-1 p-1 bg-slate-900/50 rounded-lg">
                <button
                    onClick={() => onSectionChange('conversation')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                        activeSection === 'conversation' 
                            ? 'bg-sky-600 text-white' 
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Conversation ({messageCount || 0})
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1 p-1 bg-slate-900/50 rounded-lg">
            <button
                onClick={() => onSectionChange('query')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeSection === 'query' 
                        ? 'bg-sky-600 text-white' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
                <User className="w-3.5 h-3.5" />
                Query
            </button>
            <button
                onClick={() => onSectionChange('reasoning')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeSection === 'reasoning' 
                        ? 'bg-sky-600 text-white' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
                <Brain className="w-3.5 h-3.5" />
                Reasoning
            </button>
            <button
                onClick={() => onSectionChange('answer')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeSection === 'answer' 
                        ? 'bg-sky-600 text-white' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
            >
                <Bot className="w-3.5 h-3.5" />
                Answer
            </button>
        </div>
    );
};

export default DetailSectionNav;
