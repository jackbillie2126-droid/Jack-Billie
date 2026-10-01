import React from 'react';
import { CheckCircle2, Download, Send, X } from 'lucide-react';

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  count?: number;
  type?: 'export' | 'campaign';
}

export default function CelebrationModal({
  isOpen,
  onClose,
  title,
  subtitle,
  count,
  type = 'export'
}: CelebrationModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-sm bg-white dark:bg-[#111318] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl p-5 text-center space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          {type === 'export' ? (
            <Download className="h-5 w-5" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {count !== undefined && count > 0 && (
          <div className="py-1">
            <span className="text-xs font-mono font-semibold text-neutral-700 dark:text-neutral-300">
              {count} {count === 1 ? 'Lead' : 'Leads'} Processed
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
