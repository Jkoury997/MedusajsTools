import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${padding ? 'p-4' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
