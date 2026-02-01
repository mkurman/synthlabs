import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, HelpCircle, Info, XCircle } from 'lucide-react';
import { confirmService, ConfirmRequest, ConfirmVariant } from '../services/confirmService';

const variantStyles: Record<ConfirmVariant, { icon: React.ReactNode; titleColor: string; iconBg: string }> = {
    info: {
        icon: <Info className="w-6 h-6 text-blue-400" />,
        titleColor: 'text-blue-400',
        iconBg: 'bg-blue-500/10'
    },
    warning: {
        icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
        titleColor: 'text-amber-400',
        iconBg: 'bg-amber-500/10'
    },
    danger: {
        icon: <XCircle className="w-6 h-6 text-rose-400" />,
        titleColor: 'text-rose-400',
        iconBg: 'bg-rose-500/10'
    }
};

export const ConfirmModalContainer: React.FC = () => {
    const [request, setRequest] = useState<ConfirmRequest | null>(null);

    useEffect(() => {
        return confirmService.subscribe(setRequest);
    }, []);

    const styles = useMemo(() => {
        if (!request) return variantStyles.info;
        return variantStyles[request.variant] || variantStyles.info;
    }, [request]);

    if (!request) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-full ${styles.iconBg}`}>
                        {styles.icon}
                    </div>
                    <h3 className={`text-lg font-bold ${styles.titleColor}`}>
                        {request.title || 'Are you sure?'}
                    </h3>
                </div>

                <p className="text-slate-300 mb-6 whitespace-pre-wrap">
                    {request.message}
                </p>

                <div className="flex justify-end gap-3">
                    {request.showCancel && (
                        <button
                            onClick={() => confirmService.resolveActive(false)}
                            className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                        >
                            {request.cancelLabel}
                        </button>
                    )}
                    <button
                        onClick={() => confirmService.resolveActive(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                    >
                        {request.confirmLabel || 'OK'}
                        {!request.showCancel && <HelpCircle className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
};
