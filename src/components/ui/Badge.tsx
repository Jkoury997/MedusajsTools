import type { ReactNode } from 'react';

export type BadgeTone = 'gray' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

const TONES: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-700',
  brand: 'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({
  children,
  tone = 'gray',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
