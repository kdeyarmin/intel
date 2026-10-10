import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ConfirmContext = createContext(null);

/**
 * In-app replacement for window.confirm(). Mount once near the root; then
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete this list?', destructive: true }))) return;
 */
export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    // A second confirm while one is open cancels the first.
    resolver.current?.(false);
    resolver.current = resolve;
    setOptions(typeof opts === 'string' ? { title: opts } : opts);
  }), []);

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="bg-[#0f1729] border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">{options?.title}</AlertDialogTitle>
            {options?.description && (
              <AlertDialogDescription className="text-slate-400">{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => settle(false)}
              className="bg-transparent border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              {options?.cancelLabel || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={options?.destructive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-cyan-600 text-white hover:bg-cyan-700'}
            >
              {options?.confirmLabel || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Returns confirm(options) => Promise<boolean>. Falls back to window.confirm outside the provider. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  return confirm || ((opts) => Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts?.title)));
}
