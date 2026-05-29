'use client';

import { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', id, ...props },
  ref,
) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm transition-colors focus:ring-2 focus:ring-brand-300 focus:border-brand-400 ${error ? 'border-red-300' : 'border-gray-200'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
});

/** Input grande para PIN numérico (centrado, tracking ancho). */
export const PinInput = forwardRef<HTMLInputElement, InputProps>(function PinInput(
  { className = '', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      inputMode="numeric"
      type="password"
      maxLength={6}
      className={`w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-2xl text-center tracking-[0.5em] focus:ring-2 focus:ring-brand-300 focus:border-brand-400 ${className}`}
      {...props}
    />
  );
});
