'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Icon, Wave, STATIONS, STATUS_BADGE, timeAgo, sum } from './_shared';

function progressOf(w: Wave): { done: number; total: number; label: string } {
  const totalUnits = sum(w.lines.map((l) => l.quantityRequired));
  if (w.status === 'sorting' || w.status === 'ready' || w.status === 'completed') {
    const done = sum(w.orders.flatMap((o) => o.items.map((i) => i.quantitySorted)));
    return { done, total: totalUnits, label: 'clasificadas' };
  }
  const done = sum(w.lines.map((l) => l.quantityPicked));
  return { done, total: totalUnits, label: 'recolectadas' };
}

function routeFor(w: Wave): string {
  if (w.status === 'sorting') return `mesa`;
  if (w.status === 'ready' || w.status === 'completed') return `listo`;
  return `recoleccion`;
}

export default function OlasHome() {
  const router = useRouter();
  const [station, setStation] = useState('mesa-1');
  const [waves, setWaves] = useState<Wave[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await api<{ waves: Wave[] }>('/api/picking/waves');
        if (!ignore) { setWaves(data.waves); setError(''); }
      } catch (e) {
        if (!ignore) setError((e as Error).message);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const active = (waves || []).find(
    (w) => w.stationId === station && ['draft', 'picking', 'sorting'].includes(w.status)
  );
  const recent = (waves || [])
    .filter((w) => w.status === 'ready')
    .sort((a, b) => b.displayNumber - a.displayNumber);

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push('/')}><Icon name="back" /></button>
        <div>
          <h3>Olas de picking</h3>
          <div className="sub">Depósito central · 2 mesas</div>
        </div>
        <div className="right">
          <button
            className="badge b-warn"
            style={{ border: 'none', cursor: 'pointer' }}
            onClick={() => router.push('/faltantes')}
          >
            Faltantes
          </button>
        </div>
      </header>

      <div className="body">
        <div className="seg">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              className="opt"
              data-active={station === s.id}
              onClick={() => setStation(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <div className="toast err">{error}</div>}

        {!waves && !error && <div className="spin" />}

        {waves && !active && (
          <div className="empty">
            <div className="ill"><Icon name="box" style={{ width: 38, height: 38 }} /></div>
            <h4>{STATIONS.find((s) => s.id === station)?.label} libre</h4>
            <p>No hay ninguna ola en curso en esta mesa. Armá una nueva con los pedidos a preparar.</p>
            <button
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: 4 }}
              onClick={() => router.push(`/olas/nueva?mesa=${station}`)}
            >
              <Icon name="plus" /> Nueva ola
            </button>
          </div>
        )}

        {active && (() => {
          const p = progressOf(active);
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          const badge = STATUS_BADGE[active.status];
          return (
            <div className="card pad0">
              <div style={{ padding: '15px 15px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="row gap8">
                  <span style={{ fontSize: 20, fontWeight: 800 }}>Ola #{active.displayNumber}</span>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{timeAgo(active.createdAt)}</span>
              </div>
              <div style={{ padding: '10px 15px 0' }}>
                <div className="row gap6 muted" style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {active.orders.length} pedidos · letras {active.orders[0]?.letter}–{active.orders[active.orders.length - 1]?.letter}
                </div>
                <div className="row between" style={{ marginTop: 12 }}>
                  <div><div style={{ fontSize: 22, fontWeight: 800 }}>{active.lines.length}</div><div className="muted" style={{ fontSize: 11 }}>SKUs</div></div>
                  <div><div style={{ fontSize: 22, fontWeight: 800 }}>{p.total}</div><div className="muted" style={{ fontSize: 11 }}>unidades</div></div>
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--pink-fg)' }}>{p.done}<span style={{ color: 'var(--muted)', fontSize: 14 }}>/{p.total}</span></div><div className="muted" style={{ fontSize: 11 }}>{p.label}</div></div>
                </div>
                <div className="prog" style={{ marginTop: 12 }}><i style={{ width: `${pct}%` }} /></div>
              </div>
              <div style={{ padding: '14px 15px 15px' }}>
                <button
                  className="btn btn-primary btn-block btn-lg"
                  onClick={() => router.push(`/olas/${active.id}/${routeFor(active)}`)}
                >
                  Continuar <Icon name="chevR" />
                </button>
              </div>
            </div>
          );
        })()}

        {recent.length > 0 && (
          <>
            <div className="row between" style={{ marginTop: 4 }}>
              <span className="sect-label">Olas listas</span>
            </div>
            <div className="card pad0">
              {recent.map((w, idx) => (
                <div key={w.id}>
                  {idx > 0 && <div className="divide" />}
                  <button
                    className="lrow between"
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onClick={() => router.push(`/olas/${w.id}/listo`)}
                  >
                    <div className="row gap10">
                      <span className="lcircle" style={{ background: 'var(--soft)', color: '#475569' }}>
                        {String(w.displayNumber).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="ttl" style={{ fontSize: 14 }}>Ola #{w.displayNumber}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {w.orders.length} pedidos · {sum(w.lines.map((l) => l.quantityPicked))} u.
                        </div>
                      </div>
                    </div>
                    <span className="badge b-ok">Lista</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
