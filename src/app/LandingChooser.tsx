'use client';

import './olas/olas.css';
import { useRouter } from 'next/navigation';

export default function LandingChooser() {
  const router = useRouter();
  return (
    <div className="olas-root">
      <div className="screen">
        <div className="body" style={{ flex: 1, justifyContent: 'center', gap: 18, padding: '30px 22px' }}>
          <div className="center" style={{ marginBottom: 4 }}>
            <svg viewBox="0 0 105 90" width="44" height="38" aria-hidden>
              <path fillRule="evenodd" clipRule="evenodd" fill="var(--pink)" d="M31.6161 89.1355C25.8247 89.1355 21.2618 84.2524 21.2618 78.4303C21.2618 67.1617 28.9836 67.7251 27.9306 58.7103C26.1757 52.8881 19.6823 51.9491 12.8379 51.9491C5.81804 51.9491 0.202148 46.127 0.202148 38.8024C0.202148 31.6656 5.81804 25.6557 12.8379 25.6557C13.5399 25.6557 14.2419 25.6557 14.9439 25.8435C13.7154 23.402 13.0134 20.7726 13.0134 17.7677C13.0134 8.37715 20.3843 0.864746 29.3346 0.864746C59.169 0.864746 53.9041 88.9477 31.6161 89.1355Z" />
              <path fillRule="evenodd" clipRule="evenodd" fill="var(--pink)" d="M73.3841 88.9477C79.1754 88.9477 83.7384 84.0646 83.7384 78.0547C83.7384 66.7861 76.0165 67.3495 77.0695 58.3346C78.8245 52.5125 85.3178 51.5735 92.1622 51.5735C99.0066 51.5735 104.798 45.7514 104.798 38.4268C104.798 31.29 99.1821 25.2801 92.1622 25.2801C91.4602 25.2801 90.7582 25.2801 90.0562 25.4679C91.2847 23.0263 91.9867 20.397 91.9867 17.392C91.9867 8.00154 84.6159 0.489136 75.6655 0.489136C45.8311 0.864756 51.096 88.9477 73.3841 88.9477Z" />
            </svg>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>Marcela Koury</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>¿Cómo querés entrar?</div>
          </div>

          <button className="opt-card" onClick={() => router.push('/login')}>
            <div className="oic" style={{ background: 'var(--pink-100)', color: 'var(--pink-fg)' }}>
              <svg className="i" viewBox="0 0 24 24"><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ot">Depósito · Pickeo</div>
              <div className="od">Olas, despacho y faltantes</div>
            </div>
            <svg className="i" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}><path d="m9 18 6-6-6-6" /></svg>
          </button>

          <button className="opt-card" onClick={() => router.push('/tienda')}>
            <div className="oic" style={{ background: 'var(--ok-bg)', color: '#15803d' }}>
              <svg className="i" viewBox="0 0 24 24"><path d="M3 9 4 4h16l1 5M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M3 9h18M9 21v-6h6v6" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ot">Tienda</div>
              <div className="od">Retiros en sucursal</div>
            </div>
            <svg className="i" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
