import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import {
  AlertTriangle,
  Trash2,
  FolderPlus,
  FileText,
  Cloud,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
} from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: 'trash' | 'warning' | 'folder' | 'cloud' | 'reset';
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: 'folder' | 'doc' | 'cloud';
  validate?: (val: string) => string | null;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  toast: {
    success: (msg: string, duration?: number) => void;
    error: (msg: string, duration?: number) => void;
    warning: (msg: string, duration?: number) => void;
    info: (msg: string, duration?: number) => void;
  };
}

const DialogContext = createContext<DialogContextValue | null>(null);

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};

interface DialogState {
  type: 'confirm' | 'prompt';
  confirmOptions?: ConfirmOptions;
  promptOptions?: PromptOptions;
  resolve: (value: any) => void;
}

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Modal Dialog State
  const [activeDialog, setActiveDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState<string>('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);

  // Toast State
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Focus and select input on prompt open
  useEffect(() => {
    if (activeDialog?.type === 'prompt') {
      setTimeout(() => {
        if (promptInputRef.current) {
          promptInputRef.current.focus();
          promptInputRef.current.select();
        }
      }, 50);
    }
  }, [activeDialog]);

  // Global keydown handler (Enter, Escape) for active dialog
  useEffect(() => {
    if (!activeDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        // If input focused or confirm dialog
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDialog, promptValue]);

  // Confirm API
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setActiveDialog({
        type: 'confirm',
        confirmOptions: options,
        resolve,
      });
    });
  };

  // Prompt API
  const prompt = (options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setPromptValue(options.defaultValue || '');
      setPromptError(null);
      setActiveDialog({
        type: 'prompt',
        promptOptions: options,
        resolve,
      });
    });
  };

  // Handle Cancel
  const handleCancel = () => {
    if (!activeDialog) return;
    if (activeDialog.type === 'confirm') {
      activeDialog.resolve(false);
    } else {
      activeDialog.resolve(null);
    }
    setActiveDialog(null);
  };

  // Handle Confirm
  const handleConfirm = () => {
    if (!activeDialog) return;

    if (activeDialog.type === 'confirm') {
      activeDialog.resolve(true);
      setActiveDialog(null);
    } else if (activeDialog.type === 'prompt') {
      const trimmed = promptValue.trim();
      if (activeDialog.promptOptions?.validate) {
        const err = activeDialog.promptOptions.validate(trimmed);
        if (err) {
          setPromptError(err);
          return;
        }
      }
      activeDialog.resolve(trimmed);
      setActiveDialog(null);
    }
  };

  // Toast API
  const addToast = (type: ToastItem['type'], message: string, duration = 2800) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastItem = { id, type, message, duration };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg: string, duration?: number) => addToast('success', msg, duration),
    error: (msg: string, duration?: number) => addToast('error', msg, duration),
    warning: (msg: string, duration?: number) => addToast('warning', msg, duration),
    info: (msg: string, duration?: number) => addToast('info', msg, duration),
  };

  // Render Dialog Icon
  const renderIcon = () => {
    if (activeDialog?.type === 'confirm') {
      const opts = activeDialog.confirmOptions;
      const iconType = opts?.icon || (opts?.isDestructive ? 'trash' : 'warning');
      switch (iconType) {
        case 'trash':
          return (
            <div className="w-11 h-11 rounded-full bg-red-500/10 dark:bg-red-500/20 text-red-500 flex items-center justify-center mb-3">
              <Trash2 size={20} />
            </div>
          );
        case 'cloud':
          return (
            <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
              <Cloud size={20} />
            </div>
          );
        case 'reset':
          return (
            <div className="w-11 h-11 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center mb-3">
              <RotateCcw size={20} />
            </div>
          );
        case 'folder':
          return (
            <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
              <FolderPlus size={20} />
            </div>
          );
        default:
          return (
            <div className="w-11 h-11 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center mb-3">
              <AlertTriangle size={20} />
            </div>
          );
      }
    } else if (activeDialog?.type === 'prompt') {
      const iconType = activeDialog.promptOptions?.icon || 'folder';
      if (iconType === 'doc') {
        return (
          <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
            <FileText size={20} />
          </div>
        );
      }
      return (
        <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center mb-3">
          <FolderPlus size={20} />
        </div>
      );
    }
    return null;
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt, toast }}>
      {children}

      {/* Floating macOS Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center space-y-2">
          {toasts.map((t) => {
            const styles = {
              success: 'bg-emerald-600/90 dark:bg-emerald-500/90 text-white border-emerald-500/30',
              error: 'bg-red-600/90 dark:bg-red-500/90 text-white border-red-500/30',
              warning: 'bg-amber-600/90 dark:bg-amber-500/90 text-white border-amber-500/30',
              info: 'bg-[#222224]/90 text-white border-white/10 dark:bg-white/90 dark:text-gray-900',
            }[t.type];

            const icon = {
              success: <CheckCircle2 size={14} className="shrink-0" />,
              error: <AlertCircle size={14} className="shrink-0" />,
              warning: <AlertTriangle size={14} className="shrink-0" />,
              info: <Info size={14} className="shrink-0" />,
            }[t.type];

            return (
              <div
                key={t.id}
                onClick={() => removeToast(t.id)}
                className={`pointer-events-auto cursor-pointer flex items-center space-x-2 px-3.5 py-1.5 rounded-full shadow-lg border text-xs font-medium backdrop-blur-xl transition-all duration-200 hover:scale-102 select-none ${styles}`}
              >
                {icon}
                <span>{t.message}</span>
                <X size={11} className="opacity-70 hover:opacity-100 ml-1 shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* macOS Native-Style Sheet Modal Dialog */}
      {activeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs select-none">
          <div
            className="w-[360px] max-w-[90vw] p-6 bg-[#fbfbfd]/95 dark:bg-[#252528]/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 flex flex-col items-center text-center transform transition-all animate-macModalIn"
            onClick={(e) => e.stopPropagation()}
          >
            {renderIcon()}

            {/* Dialog Title */}
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
              {activeDialog.type === 'confirm'
                ? activeDialog.confirmOptions?.title
                : activeDialog.promptOptions?.title}
            </h3>

            {/* Dialog Message */}
            {(activeDialog.type === 'confirm'
              ? activeDialog.confirmOptions?.message
              : activeDialog.promptOptions?.message) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4 whitespace-pre-wrap break-words">
                {activeDialog.type === 'confirm'
                  ? activeDialog.confirmOptions?.message
                  : activeDialog.promptOptions?.message}
              </p>
            )}

            {/* Prompt Input Box */}
            {activeDialog.type === 'prompt' && (
              <div className="w-full mb-4">
                <input
                  ref={promptInputRef}
                  type="text"
                  value={promptValue}
                  onChange={(e) => {
                    setPromptValue(e.target.value);
                    if (promptError) setPromptError(null);
                  }}
                  placeholder={activeDialog.promptOptions?.placeholder || '请输入...'}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-black/15 dark:border-white/20 bg-white dark:bg-[#1a1a1c] text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner placeholder-gray-400"
                />
                {promptError && (
                  <p className="text-[11px] text-red-500 mt-1.5 text-left">{promptError}</p>
                )}
              </div>
            )}

            {/* Bottom Action Buttons */}
            <div className="flex items-center space-x-2.5 w-full pt-1">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 transition-colors"
              >
                {activeDialog.type === 'confirm'
                  ? activeDialog.confirmOptions?.cancelText || '取消'
                  : activeDialog.promptOptions?.cancelText || '取消'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium text-white transition-all shadow-sm ${
                  activeDialog.type === 'confirm' && activeDialog.confirmOptions?.isDestructive
                    ? 'bg-red-600 hover:bg-red-700 active:scale-98'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-98'
                }`}
              >
                {activeDialog.type === 'confirm'
                  ? activeDialog.confirmOptions?.confirmText || '确定'
                  : activeDialog.promptOptions?.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
