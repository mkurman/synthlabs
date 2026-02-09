import React from 'react';
import { Tag } from 'lucide-react';
import { SessionTag } from '../interfaces/services/SessionConfig';

interface TagBadgeProps {
    tag: SessionTag;
    variant?: 'default' | 'primary' | 'secondary';
    onRemove?: () => void;
}

export const TagBadge: React.FC<TagBadgeProps> = ({ 
    tag, 
    variant = 'default',
    onRemove 
}) => {
    const variantStyles = {
        default: 'bg-slate-800/70 text-slate-300 border-slate-700/50',
        primary: 'bg-blue-900/40 text-blue-300 border-blue-800/50',
        secondary: 'bg-purple-900/40 text-purple-300 border-purple-800/50'
    };

    return (
        <span className={`
            inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border
            ${variantStyles[variant]}
        `}>
            <Tag className="w-3 h-3" />
            {tag.name}
            {onRemove && (
                <button 
                    onClick={onRemove}
                    className="hover:opacity-70 ml-0.5"
                >
                    ×
                </button>
            )}
        </span>
    );
};

export default TagBadge;
