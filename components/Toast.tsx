
import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { toast, Toast as ToastType } from '../services/toastService';

const ToastItem: React.FC<{ toast: ToastType }> = ({ toast: item }) => {
    const [isExiting, setIsExiting] = useState(false);

    const icons: Record<string, React.ReactNode> = {
        success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
        error: <AlertCircle className="w-5 h-5 text-rose-400" />,
        info: <Info className="w-5 h-5 text-blue-400" />,
        warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    };

    const bgColors: Record<string, string> = {
        success: 'bg-emerald-500/10 border-emerald-500/20',
        error: 'bg-rose-500/10 border-rose-500/20',
        info: 'bg-blue-500/10 border-blue-500/20',
        warning: 'bg-amber-500/10 border-amber-500/20',
    };

    return (
        <div
            className={`
        flex items-center gap-3 p-4 rounded-lg border backdrop-blur-md shadow-2xl
        transition-all duration-300 transform
        ${bgColors[item.type] || bgColors.info}
        ${isExiting ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'}
      `}
            style={{ minWidth: '300px', maxWidth: '450px' }}
        >
            <div className="flex-shrink-0">{icons[item.type] || icons.info}</div>
            <div className="flex-1 text-sm font-medium text-slate-100">{item.message}</div>
            <button
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(() => toast.dismiss(item.id), 300);
                }}
                className="p-1 rounded-md hover:bg-white/5 transition-colors"
            >
                <X className="w-4 h-4 text-slate-300" />
            </button>
        </div>
    );
};

export const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<ToastType[]>([]);

    useEffect(() => {
        return toast.subscribe((updatedToasts: ToastType[]) => {
            setToasts(updatedToasts);
        });
    }, []);

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
            {toasts.map((item: ToastType) => (
                <div key={item.id} className="pointer-events-auto">
                    <ToastItem toast={item} />
                </div>
            ))}
        </div>
    );
};
