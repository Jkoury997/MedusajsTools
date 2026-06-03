'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api, Icon, STATIONS, SuggestOrder, SuggestLine, Wave, timeAgo, sum,
} from '../_shared';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function NuevaOla() {
  const router = useRouter();
  const [station, setStation] = useState('mesa-1');
  const [orders, setOrders] = useState<SuggestOrder[]>([]);
  const [lines, setLines] = useState<SuggestLine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openConsolidado, setOpenConsolidado] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<{ displayNumber: number; id: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('mesa');
    if (p) setStation(p);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ suggestion: { orders: SuggestOrder[]; lines: SuggestLine[] } }>(
        '/api/picking/waves/suggest'
      );
      setOrders(data.suggestion.orders);
      setLines(data.suggestion.lines);
      setSelected(new Set(data.suggestion.orders.map((o) => o.orderId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Letras reasignadas según la selección (por prioridad/antigüedad).
  const chosen = orders.filter((o) => selected.has(o.orderId));
  const letterOf = new Map(chosen.map((o, i) => [o.orderId, LETTERS[i]]));
  // El consolidado de la sugerencia es del set propuesto; al confirmar, el backend
  // recalcula el consolidado real de los pedidos seleccionados.
  const totalUnits = sum(lines.map((l) => l.quantityRequired));

  function toggle(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else if (next.size < 8) next.add(orderId);
      return next;
    });
  }

  async function confirm() {
    setSubmitting(true);
    setError('');
    try {
      const orderIds = orders.filter((o) => selected.has(o.orderId)).map((o) => o.orderId);
      const data = await api<{ wave: Wave }>('/api/picking/waves', {
        method: 'POST',
        body: { orderIds, stationId: station },
      });
      router.push(`/olas/${data.wave.id}/recoleccion`);
    } catch (e) {
      const msg = (e as Error).message;
      // Mesa ocupada → overlay
      const m = msg.match(/#(\d+)/);
      if (/en curso/i.test(msg)) {
        setBusy({ displayNumber: m ? parseInt(m[1], 10) : 0, id: '' });
      } else {
        setError(msg);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push(`/olas`)}><Icon name="back" /></button>
        <div><h3>Nueva ola</h3></div>
      </header>

      <div className="body">
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Te sugerimos esta ola por prioridad de envío (envío rápido, Mercado Libre, tienda…) y, dentro de cada grupo, los más antiguos. Sacá o agregá los que quieras.
        </p>

        <div className="seg">
          {STATIONS.map((s) => (
            <button key={s.id} className="opt" data-active={station === s.id} onClick={() => setStation(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {error && <div className="toast err">{error}</div>}
        {loading && <div className="spin" />}

        {!loading && orders.length === 0 && (
          <div className="empty">
            <div className="ill"><Icon name="box" style={{ width: 38, height: 38 }} /></div>
            <h4>No hay pedidos pendientes</h4>
            <p>No quedan pedidos a preparar para armar una ola.</p>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <>
            <div className="card pad0">
              {orders.map((o, idx) => {
                const on = selected.has(o.orderId);
                const newGroup = idx === 0 || orders[idx - 1].group !== o.group;
                return (
                  <div key={o.orderId}>
                    {newGroup ? (
                      <div
                        style={{
                          padding: '8px 14px',
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          color: 'var(--brand-600, #2563eb)',
                          background: 'var(--soft, #f1f5f9)',
                        }}
                      >
                        {o.groupLabel}
                      </div>
                    ) : (
                      <div className="divide" />
                    )}
                    <div className="lrow between" style={on ? undefined : { opacity: 0.55 }}>
                      <div className="row gap12">
                        <span className="lcircle" style={on ? undefined : { background: 'var(--soft)', color: '#94a3b8' }}>
                          {on ? letterOf.get(o.orderId) : '—'}
                        </span>
                        <div>
                          <div className="ttl">#{o.orderDisplayId}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{timeAgo(o.createdAt)} · {o.itemCount} ítems</div>
                        </div>
                      </div>
                      <button className={`toggle${on ? '' : ' off'}`} onClick={() => toggle(o.orderId)} aria-label="incluir" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="collap">
              <div className="ch" onClick={() => setOpenConsolidado((v) => !v)}>
                <span>Consolidado a recolectar · {lines.length} SKUs · {sum(lines.map((l) => l.quantityRequired))} u.</span>
                <Icon name={openConsolidado ? 'chevD' : 'chevR'} />
              </div>
              {openConsolidado && lines.map((l) => (
                <div key={l.key}>
                  <div className="divide" />
                  <div className="lrow between">
                    <div>
                      <div className="ttl" style={{ fontSize: 13.5 }}>{l.title}</div>
                      <div className="mono">{l.sku || l.barcode || '—'}</div>
                    </div>
                    <span className="count">{l.quantityRequired}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!loading && orders.length > 0 && (
        <footer className="pfoot">
          <div className="sumline">
            <span className="muted">
              {chosen.length} pedidos · letras {chosen.length ? `A–${LETTERS[chosen.length - 1]}` : '—'}
            </span>
            <span style={{ fontWeight: 800 }}>{totalUnits} unidades</span>
          </div>
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={chosen.length === 0 || submitting}
            onClick={confirm}
          >
            {submitting ? 'Creando…' : 'Confirmar e iniciar recolección'}
          </button>
        </footer>
      )}

      {busy && (
        <div className="overlay" onClick={() => setBusy(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--warn-bg)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name="info" style={{ width: 26, height: 26 }} />
            </div>
            <h4>{STATIONS.find((s) => s.id === station)?.label} ocupada</h4>
            <p>La mesa ya tiene una ola en curso. Terminala o elegí otra mesa.</p>
            <div className="row gap8" style={{ marginTop: 4 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStation(station === 'mesa-1' ? 'mesa-2' : 'mesa-1'); setBusy(null); }}>
                Usar otra mesa
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => router.push(`/olas`)}>
                Ir a las olas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
