import { useEffect } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { useStore } from '../store';

export function Toast() {
  const { toasts, removeToast } = useStore();

  useEffect(() => {
    toasts.forEach((toast) => {
      const timer = setTimeout(() => {
        removeToast(toast.id);
      }, 3000);
      return () => clearTimeout(timer);
    });
  }, [toasts, removeToast]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
  };

  const colors = {
    success: 'bg-green-500/95',
    error: 'bg-red-500/95',
    info: 'bg-indigo-500/95',
  };

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg ${colors[toast.type]} animate-fadeInRight`}
          >
            <Icon size={20} />
            <span className="font-medium">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}