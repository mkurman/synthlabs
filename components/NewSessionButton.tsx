import { Plus } from 'lucide-react';

interface NewSessionButtonProps {
    onClick: () => void;
    disabled?: boolean;
}

export default function NewSessionButton({ onClick, disabled }: NewSessionButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`
        w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white transition-all
        bg-sky-600 hover:bg-sky-500 shadow-lg shadow-slate-950/40 hover:shadow-slate-950/60 hover:translate-y-[-1px] active:translate-y-0
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none
      `}
        >
            <Plus className="w-5 h-5" />
            <span>New Session</span>
        </button>
    );
}
