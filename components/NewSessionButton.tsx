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
        bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400
        shadow-lg shadow-teal-900/30 hover:shadow-teal-900/50 hover:scale-[1.02] active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none
      `}
        >
            <Plus className="w-5 h-5" />
            <span>New Session</span>
        </button>
    );
}
