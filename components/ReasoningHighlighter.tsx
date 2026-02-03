import React from 'react';

interface ReasoningHighlighterProps {
  text: string | object;
}

const ReasoningHighlighter: React.FC<ReasoningHighlighterProps> = ({ text }) => {
  if (!text) return <span className="text-slate-500 italic">Waiting for trace...</span>;
  
  const safeText = typeof text === 'string' ? text : JSON.stringify(text, null, 2);

  // Regex to split by special tokens
  const parts = safeText.split(/(→|↺|∴|!|※|≈|●|◐|○|⚠|<H≈[^>]+>)/g);

  return (
    <div className="font-mono text-xs md:text-sm leading-relaxed whitespace-pre-wrap text-slate-200">
      {parts.map((part, i) => {
        switch (part) {
          case '→': return <span key={i} className="text-blue-400 font-bold mx-1">→</span>;
          case '↺': return <span key={i} className="text-blue-400 font-bold mx-1">↺</span>;
          case '∴': return <span key={i} className="text-emerald-400 font-bold mx-1">∴</span>;
          case '●': return <span key={i} className="text-green-500 font-bold mx-1" title="Ground Truth">●</span>;
          case '◐': return <span key={i} className="text-yellow-500 font-bold mx-1" title="Inferred">◐</span>;
          case '○': return <span key={i} className="text-red-400 font-bold mx-1" title="Speculative">○</span>;
          case '⚠': return <span key={i} className="text-orange-500 font-bold mx-1" title="Bias/Risk">⚠</span>;
          default:
            if (part.startsWith('<H≈')) {
              return <span key={i} className="text-amber-400 font-bold mr-1">{part}</span>;
            }
            return <span key={i}>{part}</span>;
        }
      })}
    </div>
  );
};

export default ReasoningHighlighter;
