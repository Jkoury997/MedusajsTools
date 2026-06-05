'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api, Icon, ScanInput, Toast, useToast, Wave, WaveLine, sum,
} from '../../_shared';

export default function Recoleccion() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { toast, show } = useToast();
  const [wave, setWave] = useState<Wave | null>(null);
  const [error, setError] = useState('');
  const [lastKey, setLastKey] = useState('');
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [manual, setManual] = useState(false);

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

  const matches = (l: WaveLine, code: string) =>
    l.barcode === code || l.sku === code || l.variantId === code;

  async function onScan(code: string) {
    try {
      const data = await api<{ wave: Wave }>(`/api/picking/waves/${id}/pick`, {
        method: 'POST', body: { barcode: code },
      });
      setWave(data.wave);
      const line = data.wave.lines.find((l) => matches(l, code));
      if (line) {
        setLastKey(line.id);
        show('ok', `+1 ${line.title || line.sku} (${line.quantityPicked}/${line.quantityRequired})`);
      }
    } catch (e) {
      show('err', (e as Error).message);
    }
  }

  // Suma manual de 1 unidad de una línea (para productos sin barcode escaneable).
  // Reusa la ruta de pick, que acepta variantId/sku/barcode.
  async function manualAdd(l: WaveLine) {
    if (l.quantityPicked >= l.quantityRequired) return;
    try {
      const data = await api<{ wave: Wave }>(`/api/picking/waves/${id}/pick`, {
        method: 'POST',
        body: { variantId: l.variantId, sku: l.sku, barcode: l.barcode },
      });
      setWave(data.wave);
      const line = data.wave.lines.find((x) => x.id === l.id);
      setLastKey(l.id);
      show('ok', `+1 ${l.title || l.sku} (${line?.quantityPicked ?? l.quantityPicked + 1}/${l.quantityRequired})`);
    } catch (e) {
      show('err', (e as Error).message);
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      await api(`/api/picking/waves/${id}/pick/complete`, { method: 'POST' });
      router.push(`/olas/${id}/mesa`);
    } catch (e) {
      show('err', (e as Error).message);
      setFinishing(false);
      setConfirmMissing(false);
    }
  }

  function onFinishClick() {
    if (!wave) return;
    const missing = sum(wave.lines.map((l) => Math.max(0, l.quantityRequired - l.quantityPicked)));
    if (missing > 0) setConfirmMissing(true);
    else finish();
  }

  const totalReq = wave ? sum(wave.lines.map((l) => l.quantityRequired)) : 0;
  const totalPicked = wave ? sum(wave.lines.map((l) => l.quantityPicked)) : 0;
  const pct = totalReq > 0 ? Math.round((totalPicked / totalReq) * 100) : 0;
  const missing = wave ? sum(wave.lines.map((l) => Math.max(0, l.quantityRequired - l.quantityPicked))) : 0;

  return (
    <div className="screen">
      <header className="head">
        <button className="back" onClick={() => router.push(`/olas`)}><Icon name="back" /></button>
        <div>
          <h3>Ola #{wave?.displayNumber ?? ''} · Recolección</h3>
          <div className="sub">Juntá todo en una recorrida</div>
        </div>
        <div className="right">
          <button
            className="back"
            onClick={() => setManual((v) => !v)}
            aria-label="modo manual"
            title={manual ? 'Modo manual activo' : 'Activar modo manual'}
            style={manual ? { background: 'var(--pink)', color: '#fff' } : undefined}
          >
            <Icon name="hand" />
          </button>
          <button className="back" onClick={() => router.push(`/olas/${id}/imprimir`)} aria-label="imprimir">
            <Icon name="print" />
          </button>
          <span className="badge b-pink" style={{ fontSize: 14, padding: '6px 12px' }}>{totalPicked} / {totalReq}</span>
        </div>
      </header>

      <div className="body">
        {error && <div className="toast err">{error}</div>}
        {!wave && <div className="spin" />}

        {wave && (
          <>
            <div className="prog big"><i style={{ width: `${pct}%` }} /></div>
            <ScanInput onScan={onScan} />
            <Toast toast={toast} />

            <div className="card pad0">
              {[...wave.lines]
                .sort((a, b) => b.quantityRequired - a.quantityRequired)
                .map((l, idx) => {
                  const done = l.quantityPicked >= l.quantityRequired;
                  const isLast = l.id === lastKey;
                  return (
                    <div key={l.id}>
                      {idx > 0 && <div className="divide" />}
                      <div
                        className="lrow"
                        style={
                          done
                            ? { opacity: 0.55 }
                            : isLast
                              ? { background: 'var(--pink-50)', boxShadow: 'inset 3px 0 0 var(--pink)' }
                              : undefined
                        }
                      >
                        <span
                          className="thumb"
                          style={done ? { background: 'var(--ok-bg)', borderColor: '#bbf7d0', color: '#16a34a' } : undefined}
                        >
                          <Icon name={done ? 'check' : 'box'} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ttl" style={{ fontSize: 14 }}>{l.title || 'Producto'}</div>
                          <div className="mono">{l.externalId || l.sku || l.barcode || '—'}</div>
                          {(l.size || l.color) && (
                            <div className="row gap6" style={{ marginTop: 4 }}>
                              {l.size && (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--soft, #f1f5f9)', color: '#334155' }}>
                                  Talle {l.size}
                                </span>
                              )}
                              {l.color && (
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--soft, #f1f5f9)', color: '#334155' }}>
                                  {l.color}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {done ? (
                          <span className="badge b-ok">Listo</span>
                        ) : (
                          <div className="row gap8" style={{ alignItems: 'center' }}>
                            <span className="count" style={isLast ? { color: 'var(--pink-fg)' } : { color: 'var(--muted)' }}>
                              {l.quantityPicked}<span className="tot">/{l.quantityRequired}</span>
                            </span>
                            {(manual || !l.barcode) && (
                              <button
                                onClick={() => manualAdd(l)}
                                aria-label="sumar uno"
                                style={{
                                  width: 38, height: 38, flex: 'none', borderRadius: 11, border: 'none',
                                  background: 'var(--pink)', color: '#fff', fontSize: 22, fontWeight: 700,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                +
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>

      {wave && (
        <footer className="pfoot">
          <button className="btn btn-primary btn-block btn-lg" onClick={onFinishClick} disabled={finishing}>
            {finishing ? 'Cerrando…' : 'Terminar recolección'}
          </button>
        </footer>
      )}

      {confirmMissing && (
        <div className="overlay" onClick={() => setConfirmMissing(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h4>¿Terminar con faltantes?</h4>
            <p>Faltan <b style={{ color: 'var(--ink)' }}>{missing} unidad{missing > 1 ? 'es' : ''}</b> por recolectar. Podés continuar y resolverlas como faltante en cada pedido.</p>
            <div className="row gap8">
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmMissing(false)}>Seguir recolectando</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={finish} disabled={finishing}>Continuar igual</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
