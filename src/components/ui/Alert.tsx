import type { ReactNode } from 'react';

type Tone = 'success' | 'error' | 'warning' | 'info';

const TONES: Record<Tone, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const ICONS: Record<Tone, string> = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

export function Alert({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 border rounded-xl p-3 text-sm font-medium ${TONES[tone]} ${className}`}>
      <span aria-hidden>{ICONS[tone]}</span>
      <span>{children}</span>
    </div>
  );
}
