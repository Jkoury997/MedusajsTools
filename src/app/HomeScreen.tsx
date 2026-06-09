'use client';

import './olas/olas.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './olas/_shared';

interface Wave { status: string; stationId: string; }

// ---- íconos locales (stroke currentColor vía .i) ----
const I = {
  box: <><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  truck: <><path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  shop: <path d="M3 9 4 4h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18M9 21v-6h6v6" />,
  repos: <path d="M20 7h-9M14 17H5M17 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM7 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0z" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  chevR: <path d="m9 18 6-6-6-6" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

function FnCard({ icon, title, sub, count, onClick, disabled }: {
  icon: React.ReactNode; title: string; sub: string; count: React.ReactNode;
  onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button className="func" onClick={onClick} disabled={disabled}>
      <div className="chip"><svg className="i" viewBox="0 0 24 24">{icon}</svg></div>
      <div><div className="ft">{title}</div><div className="fs">{sub}</div></div>
      <div className="fcount" style={disabled ? { color: 'var(--muted)' } : undefined}>
        {count}
        {!disabled && <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>{I.chevR}</svg>}
      </div>
    </button>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [olas, setOlas] = useState<{ active: number; station?: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    api<{ waves: Wave[] }>('/api/picking/waves')
      .then((d) => {
        const active = (d.waves || []).filter((w) => ['draft', 'picking', 'sorting'].includes(w.status));
        setOlas({ active: active.length, station: active[0]?.stationId });
      }).catch(() => setOlas({ active: 0 }));
    // Una sola llamada a /api/gestion trae todos los contadores (despacho + faltantes).
    api<{ counts: Record<string, number> }>('/api/gestion?tab=faltantes')
      .then((d) => setCounts(d.counts || {})).catch(() => setCounts({}));
  }, []);

  const faltantes = counts === null ? null : (counts.faltantes ?? 0);
  const porEnviar = counts === null ? null : (counts['por-enviar'] ?? 0);

  async function logout() {
    await fetch('/api/picking/login', { method: 'DELETE' });
    try {
      navigator.serviceWorker?.controller?.postMessage('CLEAR_CACHES');
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* best-effort */ }
    router.push('/login');
    router.refresh();
  }

  const hour = new Date().getHours();
  const greet = hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const stationLabel = olas?.station ? olas.station.replace('mesa-', 'Mesa ') : '';

  return (
    <div className="olas-root">
      <div className="screen">
        <header className="head">
          <svg viewBox="0 0 105 90" width="34" height="29" aria-hidden style={{ flex: 'none' }}>
            <path fillRule="evenodd" clipRule="evenodd" fill="var(--pink)" d="M31.6161 89.1355C25.8247 89.1355 21.2618 84.2524 21.2618 78.4303C21.2618 67.1617 28.9836 67.7251 27.9306 58.7103C26.1757 52.8881 19.6823 51.9491 12.8379 51.9491C5.81804 51.9491 0.202148 46.127 0.202148 38.8024C0.202148 31.6656 5.81804 25.6557 12.8379 25.6557C13.5399 25.6557 14.2419 25.6557 14.9439 25.8435C13.7154 23.402 13.0134 20.7726 13.0134 17.7677C13.0134 8.37715 20.3843 0.864746 29.3346 0.864746C59.169 0.864746 53.9041 88.9477 31.6161 89.1355Z" />
            <path fillRule="evenodd" clipRule="evenodd" fill="var(--pink)" d="M73.3841 88.9477C79.1754 88.9477 83.7384 84.0646 83.7384 78.0547C83.7384 66.7861 76.0165 67.3495 77.0695 58.3346C78.8245 52.5125 85.3178 51.5735 92.1622 51.5735C99.0066 51.5735 104.798 45.7514 104.798 38.4268C104.798 31.29 99.1821 25.2801 92.1622 25.2801C91.4602 25.2801 90.7582 25.2801 90.0562 25.4679C91.2847 23.0263 91.9867 20.397 91.9867 17.392C91.9867 8.00154 84.6159 0.489136 75.6655 0.489136C45.8311 0.864756 51.096 88.9477 73.3841 88.9477Z" />
          </svg>
          <div>
            <div className="greet">{greet}</div>
            <div className="sub">Depósito · Pickeo</div>
          </div>
          <div className="right">
            <button className="back" onClick={logout} title="Cerrar sesión">
              <svg className="i" viewBox="0 0 24 24">{I.logout}</svg>
            </button>
          </div>
        </header>

        <div className="body">
          <div className="func-grid">
            <FnCard
              icon={I.box} title="Olas" sub="Picking por olas"
              count={olas === null ? '…' : olas.active > 0 ? `${olas.active} activa${olas.active !== 1 ? 's' : ''}${stationLabel ? ` · ${stationLabel}` : ''}` : 'Armar ola'}
              onClick={() => router.push('/olas')}
            />
            <FnCard
              icon={I.truck} title="Despacho" sub="Por enviar / enviados"
              count={porEnviar === null ? '…' : `${porEnviar} por enviar`}
              onClick={() => router.push('/gestion?tab=por-enviar')}
            />
            <FnCard
              icon={I.shop} title="Tienda" sub="Retiros en sucursal"
              count="Ver pedidos"
              onClick={() => router.push('/tienda')}
            />
            <FnCard
              icon={I.repos} title="Reposición" sub="Recibir stock"
              count="Próximamente"
              disabled
            />
          </div>

          <div className="row between" style={{ padding: '0 2px', marginTop: 4 }}>
            <span className="sect-label">Para resolver</span>
          </div>
          <button className="resolve-card" onClick={() => router.push('/faltantes')}>
            <div className="ic"><svg className="i" viewBox="0 0 24 24">{I.alert}</svg></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e' }}>Faltantes a resolver</div>
              <div style={{ fontSize: 12.5, color: '#9a6c0e' }}>
                {faltantes === null
                  ? 'Cargando…'
                  : faltantes === 0
                    ? 'Sin faltantes pendientes'
                    : `${faltantes} pedido${faltantes !== 1 ? 's' : ''} esperando voucher o reposición`}
              </div>
            </div>
            {faltantes !== null && faltantes > 0 && (
              <span className="badge b-warn" style={{ fontSize: 14, padding: '5px 11px' }}>{faltantes}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
