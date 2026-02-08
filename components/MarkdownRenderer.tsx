import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    return (
        <div className={`markdown-content ${className}`}>
            <style>{`
                .markdown-content h1 { font-size: 1.25rem; font-weight: bold; margin-top: 1rem; margin-bottom: 0.5rem; color: #f1f5f9; }
                .markdown-content h2 { font-size: 1.125rem; font-weight: bold; margin-top: 0.75rem; margin-bottom: 0.5rem; color: #f1f5f9; }
                .markdown-content h3 { font-size: 1rem; font-weight: 600; margin-top: 0.75rem; margin-bottom: 0.25rem; color: #e2e8f0; }
                .markdown-content h4 { font-size: 0.875rem; font-weight: 600; margin-top: 0.5rem; margin-bottom: 0.25rem; color: #e2e8f0; }
                .markdown-content p { margin-bottom: 0.5rem; line-height: 1.625; }
                .markdown-content p:last-child { margin-bottom: 0; }
                .markdown-content ul { list-style-type: disc; padding-left: 1rem; margin-bottom: 0.5rem; }
                .markdown-content ol { list-style-type: decimal; padding-left: 1rem; margin-bottom: 0.5rem; }
                .markdown-content li { margin-bottom: 0.125rem; color: #cbd5e1; }
                .markdown-content code { background-color: #1e293b; color: #e2e8f0; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; font-family: monospace; }
                .markdown-content pre { background-color: #020617; border: 1px solid #1e293b; border-radius: 0.5rem; padding: 0.75rem; margin: 0.5rem 0; overflow-x: auto; }
                .markdown-content pre code { background-color: transparent; padding: 0; }
                .markdown-content a { color: #38bdf8; text-decoration: underline; }
                .markdown-content a:hover { color: #7dd3fc; }
                .markdown-content blockquote { border-left: 4px solid #475569; padding-left: 0.75rem; margin: 0.5rem 0; color: #94a3b8; font-style: italic; }
                .markdown-content hr { border-color: #334155; margin: 0.75rem 0; }
                .markdown-content table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.875rem; }
                .markdown-content th, .markdown-content td { border: 1px solid #334155; padding: 0.5rem; text-align: left; }
                .markdown-content th { background-color: #1e293b; font-weight: 600; color: #e2e8f0; }
                .markdown-content td { color: #cbd5e1; }
                .markdown-content strong { font-weight: 600; color: #f1f5f9; }
                .markdown-content em { font-style: italic; }
            `}</style>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
