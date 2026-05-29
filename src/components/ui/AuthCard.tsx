import type { ReactNode } from 'react';

/** Cáscara visual compartida para las pantallas de PIN (login, tienda, picking). */
export function AuthCard({
  icon,
  title,
  subtitle,
  children,
  footer,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-7">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-4 text-3xl">
              {icon}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <div className="text-center mt-4">{footer}</div>}
      </div>
    </div>
  );
}
