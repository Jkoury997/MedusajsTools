'use client';

import './imprimir.css';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, Icon, Wave, sum } from '../../_shared';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
type Doc = 'recoleccion' | 'mesa';

export default function Imprimir() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [wave, setWave] = useState<Wave | null>(null);
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<Doc>('recoleccion');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await api<{ wave: Wave }>(`/api/picking/waves/${id}`);
        if (!ignore) setWave(data.wave);
      } catch (e) {
        if (!ignore) setError((e as Error).message);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  const mesaLabel = wave ? wave.stationId.replace('mesa-', 'Mesa ') : '';
  const lines = wave ? [...wave.lines].sort((a, b) => b.quantityRequired - a.quantityRequired) : [];
  const orders = wave ? [...wave.orders].sort((a, b) => a.priority - b.priority) : [];
  const byLetter = new Map(orders.map((o) => [o.letter, o]));
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="olas-print">
      <div className="toolbar">
        <button className="back" onClick={() => router.push(`/olas/${id}/recoleccion`)}><Icon name="back" /></button>
        <div className="seg">
          <button data-active={doc === 'recoleccion'} onClick={() => setDoc('recoleccion')}>Hoja de recolección</button>
          <button data-active={doc === 'mesa'} onClick={() => setDoc('mesa')}>Etiquetas de mesa</button>
        </div>
        <button className="print-btn" onClick={() => window.print()}>
          <Icon name="print" /> Imprimir
        </button>
      </div>

      <div className="stage">
        {error && <div className="doc-cap" style={{ color: 'var(--pink)' }}>{error}</div>}
        {!wave && <div className="doc-cap">Cargando…</div>}

        {wave && (
          <>
            {/* ---- Hoja de recolección (A4) ---- */}
            <div className="doc" data-show={doc === 'recoleccion'}>
              <div className="doc-cap">Hoja de recolección consolidada — A4</div>
              <div className="sheet">
                <div className="sheet-head">
                  <span className="brand">MARCELA KOURY</span>
                  <div className="doc-title"><h2>Recolección de ola</h2><p>Picking por olas · consolidado por SKU</p></div>
                </div>
                <div className="ordernum"><span className="big">Ola #{wave.displayNumber}</span><span className="badge">Recolectando</span></div>
                <div className="meta">
                  <div className="field"><div className="k">Mesa</div><div className="v">{mesaLabel} · letras {orders[0]?.letter}–{orders[orders.length - 1]?.letter}</div></div>
                  <div className="field"><div className="k">Fecha</div><div className="v">{fecha}</div></div>
                  <div className="field"><div className="k">Pedidos</div><div className="v">{orders.length} pedidos</div></div>
                  <div className="field"><div className="k">Total a recolectar</div><div className="v">{lines.length} SKUs · {sum(lines.map((l) => l.quantityRequired))} unidades</div></div>
                </div>
                <table className="items">
                  <thead><tr><th className="c-idx">#</th><th>Producto</th><th>Código</th><th className="c-qty">Cant.</th><th className="c-check">OK</th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.id}>
                        <td className="c-idx">{i + 1}</td>
                        <td className="c-name">{l.title || 'Producto'}</td>
                        <td className="c-sku">{l.sku || l.barcode || '—'}</td>
                        <td className="c-qty">{l.quantityRequired}</td>
                        <td className="c-check"><span className="box" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="wave-letters">
                  <div className="lbl">Pedidos de la ola</div>
                  {orders.map((o) => (
                    <div key={o.id} className="wl"><b>{o.letter}</b><span>Pedido #{o.orderDisplayId}</span></div>
                  ))}
                </div>
                <div className="signrow">
                  <div className="sig"><div className="line" /><div className="slbl">Recolectó (nombre y firma)</div></div>
                  <div className="sig" style={{ maxWidth: 140 }}><div className="line" /><div className="slbl">Hora fin recolección</div></div>
                </div>
                <div className="sheet-foot"><span>Pickping System · Marcela Koury</span><span>Ola #{wave.displayNumber} · {mesaLabel}</span></div>
              </div>
            </div>

            {/* ---- Etiquetas de mesa (A4) ---- */}
            <div className="doc" data-show={doc === 'mesa'}>
              <div className="doc-cap">Etiquetas de mesa (put-to-wall) — A4 · 8 posiciones</div>
              <div className="sheet">
                <div className="sheet-head">
                  <span className="brand">MARCELA KOURY</span>
                  <div className="doc-title"><h2>Etiquetas de mesa</h2><p>Put-to-wall · Ola #{wave.displayNumber} · {mesaLabel}</p></div>
                </div>
                <div className="mesa-grid">
                  {LETTERS.map((L) => {
                    const o = byLetter.get(L);
                    if (!o) {
                      return (
                        <div key={L} className="mesa-label libre">
                          <div className="ml-top">Posición</div><div className="ml-L">{L}</div><div className="ml-ola">Libre</div>
                        </div>
                      );
                    }
                    return (
                      <div key={L} className="mesa-label">
                        <div className="ml-top">Posición</div>
                        <div className="ml-L">{L}</div>
                        <div className="ml-ped">Pedido #{o.orderDisplayId}</div>
                        <div className="ml-ola">Ola #{wave.displayNumber} · {mesaLabel}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="sheet-foot" style={{ marginTop: '10mm' }}><span>Pegá cada etiqueta en su posición de la mesa</span><span>Ola #{wave.displayNumber} · {mesaLabel}</span></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
