'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

const LINKS = [
  { href: '/admin/auditoria', label: 'Auditoría' },
  { href: '/admin/historial', label: 'Historial' },
  { href: '/admin/usuarios', label: 'Usuarios' },
  { href: '/admin/faltantes', label: 'Faltantes' },
  { href: '/admin/seguridad', label: 'Seguridad' },
];

/** Barra de navegación compartida del panel admin. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 mb-4 print:hidden">
      <div className="flex items-center gap-2 py-2 overflow-x-auto">
        <Link
          href="/gestion"
          className="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-800 pr-2 border-r border-gray-200"
        >
          ← Gestión
        </Link>
        <div className="flex items-center gap-1 flex-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-brand-100 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="shrink-0">
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
