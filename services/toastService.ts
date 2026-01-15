
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

class ToastService {
    private toasts: Toast[] = [];
    private listeners: ToastListener[] = [];

    private notify() {
        this.listeners.forEach(listener => listener([...this.toasts]));
    }

    subscribe(listener: ToastListener) {
        this.listeners.push(listener);
        listener([...this.toasts]);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    show(message: string, type: ToastType = 'info', duration: number = 3000) {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, type, message, duration };

        this.toasts = [...this.toasts, newToast];
        this.notify();

        if (duration > 0) {
            setTimeout(() => {
                this.dismiss(id);
            }, duration);
        }
    }

    success(message: string, duration?: number) {
        this.show(message, 'success', duration);
    }

    error(message: string, duration?: number) {
        this.show(message, 'error', duration);
    }

    info(message: string, duration?: number) {
        this.show(message, 'info', duration);
    }

    warning(message: string, duration?: number) {
        this.show(message, 'warning', duration);
    }

    dismiss(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
        this.notify();
    }
}

export const toast = new ToastService();
export type { Toast, ToastType };
