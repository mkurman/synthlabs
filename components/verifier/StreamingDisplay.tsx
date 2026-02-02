interface StreamingDisplayProps {
    content: string;
    className?: string;
}

export default function StreamingDisplay({ content, className = '' }: StreamingDisplayProps) {
    return (
        <div className={`max-h-32 overflow-y-auto text-[10px] font-mono animate-pulse ${className}`}>
            {content}
            <span className="inline-block w-2 h-3 bg-current ml-0.5 animate-pulse" />
        </div>
    );
}
