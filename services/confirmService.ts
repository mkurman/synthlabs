type ConfirmVariant = 'info' | 'warning' | 'danger';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmVariant;
    showCancel?: boolean;
}

interface ConfirmRequest extends Required<Pick<ConfirmOptions, 'message'>> {
    id: string;
    title?: string;
    confirmLabel: string;
    cancelLabel: string;
    variant: ConfirmVariant;
    showCancel: boolean;
    resolve: (value: boolean) => void;
}

type ConfirmListener = (request: ConfirmRequest | null) => void;

class ConfirmService {
    private queue: ConfirmRequest[] = [];
    private active: ConfirmRequest | null = null;
    private listeners: ConfirmListener[] = [];

    private notify() {
        this.listeners.forEach(listener => listener(this.active));
    }

    subscribe(listener: ConfirmListener) {
        this.listeners.push(listener);
        listener(this.active);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private activateNext() {
        if (this.active || this.queue.length === 0) return;
        this.active = this.queue.shift() || null;
    }

    private enqueue(options: ConfirmOptions): Promise<boolean> {
        return new Promise(resolve => {
            const request: ConfirmRequest = {
                id: Math.random().toString(36).substring(2, 9),
                title: options.title,
                message: options.message,
                confirmLabel: options.confirmLabel || 'Confirm',
                cancelLabel: options.cancelLabel || 'Cancel',
                variant: options.variant || 'info',
                showCancel: options.showCancel ?? true,
                resolve
            };

            this.queue.push(request);
            this.activateNext();
            this.notify();
        });
    }

    confirm(options: ConfirmOptions): Promise<boolean> {
        return this.enqueue({ ...options, showCancel: true });
    }

    alert(options: ConfirmOptions): Promise<void> {
        return this.enqueue({ ...options, showCancel: false, confirmLabel: options.confirmLabel || 'OK' }).then(() => undefined);
    }

    resolveActive(result: boolean) {
        if (!this.active) return;
        const current = this.active;
        this.active = null;
        current.resolve(result);
        this.activateNext();
        this.notify();
    }
}

export const confirmService = new ConfirmService();
export type { ConfirmOptions, ConfirmVariant, ConfirmRequest };
