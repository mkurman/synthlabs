import React, { useRef, useEffect } from 'react';

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    value: string;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = (props) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            // Reset height to auto to correctly interpret scrollHeight (shrink if needed)
            textarea.style.height = 'auto';
            // Set new height based on scrollHeight, or keep minimum if specified in CSS
            // We use standard calculation.
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
    }, [props.value]);

    // Also adjust on mount
    useEffect(() => {
        adjustHeight();
    }, []);

    // Extract resizing class if present to avoid conflicts, though we force resize-vertical via style usually?
    // User requested "being resizable". We allow 'resize-y' but caveat: typing will snap to content height.
    // However, if we only set height if scrollHeight > current height?
    // No, standard auto-grow is robust. "Resizable" might effectively mean "it resizes itself".

    return (
        <textarea
            {...props}
            ref={textareaRef}
            className={`${props.className || ''} resize-y overflow-hidden`}
            rows={1} // Start with 1 row, let script handle height
        />
    );
};

export default AutoResizeTextarea;
